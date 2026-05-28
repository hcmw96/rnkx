-- Persist club image/name/visibility for creators (bypasses private_leagues update RLS edge cases).

create or replace function public.update_private_club(
  p_league_id uuid,
  p_athlete_id uuid,
  p_name text default null,
  p_image_url text default null,
  p_is_public boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  update public.private_leagues pl
  set
    name = coalesce(nullif(trim(p_name), ''), pl.name),
    image_url = coalesce(p_image_url, pl.image_url),
    is_public = coalesce(p_is_public, pl.is_public)
  where pl.id = p_league_id;
end;
$$;

revoke all on function public.update_private_club(uuid, uuid, text, text, boolean) from public;
grant execute on function public.update_private_club(uuid, uuid, text, text, boolean) to authenticated;

-- Align client RLS with athletes linked by id OR user_id (legacy rows).
drop policy if exists "private_leagues_update_creator" on public.private_leagues;

create policy "private_leagues_update_creator"
  on public.private_leagues
  for update
  using (
    exists (
      select 1
      from public.athletes a
      where a.id = private_leagues.created_by
        and (a.user_id = auth.uid() or a.id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.athletes a
      where a.id = private_leagues.created_by
        and (a.user_id = auth.uid() or a.id = auth.uid())
    )
  );

drop policy if exists "private_leagues_insert" on public.private_leagues;

create policy "private_leagues_insert"
  on public.private_leagues
  for insert
  with check (
    exists (
      select 1
      from public.athletes a
      where a.id = private_leagues.created_by
        and (a.user_id = auth.uid() or a.id = auth.uid())
    )
  );

-- create_private_club: allow creator check by athlete id OR auth uid
create or replace function public.create_private_club(
  p_athlete_id uuid,
  p_name text,
  p_league_type text,
  p_is_public boolean default false,
  p_image_url text default null
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
        is_public
      )
      values (
        v_name,
        p_athlete_id,
        p_league_type,
        v_conversation_id,
        p_image_url,
        v_invite_code,
        coalesce(p_is_public, false)
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
