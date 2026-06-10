-- Enforce club gender for creators (not only joiners) and clean up existing mismatches.

create or replace function public.create_private_club(
  p_athlete_id uuid,
  p_name text,
  p_league_type text,
  p_is_public boolean default false,
  p_image_url text default null,
  p_gender text default 'mixed'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_conversation_id uuid;
  v_league_id uuid;
  v_invite_code text;
  v_attempt int;
  v_gender text;
  v_athlete_gender text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_athlete_user_id(p_athlete_id);

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  v_name := nullif(trim(p_name), '');
  if v_name is null then
    raise exception 'Club name is required';
  end if;

  if p_league_type not in ('engine', 'run') then
    raise exception 'Invalid league type';
  end if;

  v_gender := coalesce(nullif(trim(p_gender), ''), 'mixed');
  if v_gender not in ('male', 'female', 'mixed') then
    raise exception 'Invalid club gender';
  end if;

  select a.gender into v_athlete_gender
  from public.athletes a
  where a.id = p_athlete_id;

  if v_gender <> 'mixed' then
    if v_athlete_gender is null or v_athlete_gender <> v_gender then
      if v_gender = 'male' then
        raise exception 'You can only create a men''s club if your profile gender is male';
      elsif v_gender = 'female' then
        raise exception 'You can only create a women''s club if your profile gender is female';
      else
        raise exception 'Gender mismatch';
      end if;
    end if;
  end if;

  insert into public.conversations (is_group, name, created_by)
  values (true, v_name, p_athlete_id)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, athlete_id)
  values (v_conversation_id, p_athlete_id);

  for v_attempt in 1..8 loop
    v_invite_code := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8);
    begin
      insert into public.private_leagues (
        name,
        created_by,
        league_type,
        conversation_id,
        image_url,
        invite_code,
        is_public,
        gender
      )
      values (
        v_name,
        p_athlete_id,
        p_league_type,
        v_conversation_id,
        p_image_url,
        v_invite_code,
        coalesce(p_is_public, false),
        v_gender
      )
      returning id into v_league_id;
      exit;
    exception
      when unique_violation then
        if v_attempt = 8 then
          raise;
        end if;
    end;
  end loop;

  insert into public.private_league_members (league_id, athlete_id, status)
  values (v_league_id, p_athlete_id, 'accepted');

  return v_league_id;
end;
$$;

create or replace function public.update_private_club(
  p_league_id uuid,
  p_athlete_id uuid,
  p_name text default null,
  p_image_url text default null,
  p_is_public boolean default null,
  p_gender text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
  v_new_name text;
  v_gender text;
  v_creator_gender text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_athlete_user_id(p_athlete_id);

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from public.private_leagues pl
    where pl.id = p_league_id
      and pl.created_by = p_athlete_id
  ) then
    raise exception 'Club not found or not creator';
  end if;

  select pl.conversation_id into v_conv_id
  from public.private_leagues pl
  where pl.id = p_league_id;

  v_new_name := nullif(trim(p_name), '');

  if p_gender is not null then
    v_gender := nullif(trim(p_gender), '');
    if v_gender is not null and v_gender not in ('male', 'female', 'mixed') then
      raise exception 'Invalid club gender';
    end if;

    if v_gender is not null and v_gender <> 'mixed' then
      select a.gender into v_creator_gender
      from public.athletes a
      where a.id = p_athlete_id;

      if v_creator_gender is null or v_creator_gender <> v_gender then
        if v_gender = 'male' then
          raise exception 'You can only set a men''s club if your profile gender is male';
        elsif v_gender = 'female' then
          raise exception 'You can only set a women''s club if your profile gender is female';
        else
          raise exception 'Gender mismatch';
        end if;
      end if;
    end if;
  end if;

  update public.private_leagues pl
  set
    name = coalesce(v_new_name, pl.name),
    image_url = coalesce(p_image_url, pl.image_url),
    is_public = coalesce(p_is_public, pl.is_public),
    gender = coalesce(v_gender, pl.gender)
  where pl.id = p_league_id;

  if v_conv_id is not null and v_new_name is not null then
    update public.conversations c
    set name = v_new_name
    where c.id = v_conv_id;
  end if;
end;
$$;

-- Remove members (including creators) whose profile gender does not match a gendered club.
delete from public.private_league_members plm
using public.private_leagues pl, public.athletes a
where plm.league_id = pl.id
  and plm.athlete_id = a.id
  and pl.gender in ('male', 'female')
  and (a.gender is null or a.gender <> pl.gender);
