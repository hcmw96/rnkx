-- Club gender: men-only, women-only, or mixed (default).

alter table public.private_leagues
  add column if not exists gender text not null default 'mixed'
  check (gender in ('male', 'female', 'mixed'));

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

revoke all on function public.create_private_club(uuid, text, text, boolean, text, text) from public;
grant execute on function public.create_private_club(uuid, text, text, boolean, text, text) to authenticated;

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

revoke all on function public.update_private_club(uuid, uuid, text, text, boolean, text) from public;
grant execute on function public.update_private_club(uuid, uuid, text, text, boolean, text) to authenticated;

create or replace function public.add_member_to_club(
  p_league_id uuid,
  p_athlete_id uuid,
  p_invite_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_athlete_id uuid;
  v_creator_id uuid;
  v_is_public boolean;
  v_conv_id uuid;
  v_league_invite_code text;
  v_has_pending_invite boolean;
  v_existing_status text;
  v_club_gender text;
  v_athlete_gender text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select a.id into v_caller_athlete_id
  from public.athletes a
  where a.user_id = auth.uid()
     or a.id = auth.uid()
  order by case when a.user_id = auth.uid() then 0 else 1 end
  limit 1;

  if v_caller_athlete_id is null then
    raise exception 'Forbidden';
  end if;

  select
    pl.created_by,
    coalesce(pl.is_public, false),
    pl.conversation_id,
    pl.invite_code,
    coalesce(pl.gender, 'mixed')
  into v_creator_id, v_is_public, v_conv_id, v_league_invite_code, v_club_gender
  from public.private_leagues pl
  where pl.id = p_league_id;

  if v_creator_id is null then
    raise exception 'Club not found';
  end if;

  select a.gender into v_athlete_gender
  from public.athletes a
  where a.id = p_athlete_id;

  if v_club_gender <> 'mixed' then
    if v_athlete_gender is null or v_athlete_gender <> v_club_gender then
      if v_club_gender = 'male' then
        raise exception 'This club is for men only';
      elsif v_club_gender = 'female' then
        raise exception 'This club is for women only';
      else
        raise exception 'Gender mismatch';
      end if;
    end if;
  end if;

  if v_caller_athlete_id = v_creator_id and p_athlete_id <> v_caller_athlete_id then
    select plm.status
      into v_existing_status
    from public.private_league_members plm
    where plm.league_id = p_league_id
      and plm.athlete_id = p_athlete_id
    limit 1;

    if v_existing_status = 'accepted' then
      raise exception 'Already a member';
    end if;

    if v_existing_status = 'pending' then
      raise exception 'Already invited';
    end if;

    insert into public.private_league_members (league_id, athlete_id, status, invited_by)
    values (p_league_id, p_athlete_id, 'pending', v_caller_athlete_id);
    return;
  end if;

  if p_athlete_id <> v_caller_athlete_id then
    raise exception 'Forbidden';
  end if;

  select exists (
    select 1
    from public.private_league_members plm
    where plm.league_id = p_league_id
      and plm.athlete_id = p_athlete_id
      and plm.status = 'pending'
  ) into v_has_pending_invite;

  if not (
    v_is_public
    or v_has_pending_invite
    or (p_invite_code is not null and p_invite_code = v_league_invite_code)
  ) then
    raise exception 'Forbidden';
  end if;

  insert into public.private_league_members (league_id, athlete_id, status)
  values (p_league_id, p_athlete_id, 'accepted')
  on conflict (league_id, athlete_id) do update
    set status = 'accepted';

  if v_conv_id is not null then
    insert into public.conversation_members (conversation_id, athlete_id)
    values (v_conv_id, p_athlete_id)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.add_member_to_club(uuid, uuid, text) from public;
grant execute on function public.add_member_to_club(uuid, uuid, text) to authenticated;

drop function if exists public.get_private_league(uuid);

create function public.get_private_league(p_league_id uuid)
returns table (
  id uuid,
  name text,
  image_url text,
  league_type text,
  created_by uuid,
  conversation_id uuid,
  invite_code text,
  is_public boolean,
  gender text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pl.id,
    pl.name,
    pl.image_url,
    pl.league_type,
    pl.created_by,
    pl.conversation_id,
    pl.invite_code,
    pl.is_public,
    coalesce(pl.gender, 'mixed')
  from public.private_leagues pl
  where pl.id = p_league_id
    and (
      pl.created_by in (select public.current_athlete_ids())
      or pl.id in (select public.caller_private_league_ids())
      or coalesce(pl.is_public, false) = true
    )
  limit 1;
$$;

revoke all on function public.get_private_league(uuid) from public;
grant execute on function public.get_private_league(uuid) to authenticated;

drop function if exists public.get_private_league_for_join(text);

create function public.get_private_league_for_join(p_invite_code text)
returns table (
  id uuid,
  name text,
  member_count bigint,
  conversation_id uuid,
  gender text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pl.id,
    pl.name,
    coalesce(
      (
        select count(*)::bigint
        from public.private_league_members m
        where m.league_id = pl.id and m.status = 'accepted'
      ),
      0
    ) as member_count,
    pl.conversation_id,
    coalesce(pl.gender, 'mixed')
  from public.private_leagues pl
  where pl.invite_code is not null
    and pl.invite_code = p_invite_code
  limit 1;
$$;

revoke all on function public.get_private_league_for_join(text) from public;
grant execute on function public.get_private_league_for_join(text) to anon, authenticated;
