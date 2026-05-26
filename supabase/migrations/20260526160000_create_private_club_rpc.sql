-- Create club in one RPC (bypasses conversation_members RLS recursion on native client).

create or replace function public.ensure_athlete_user_id(p_athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.athletes
  set user_id = auth.uid()
  where id = p_athlete_id
    and user_id is distinct from auth.uid()
    and (id = auth.uid() or user_id = auth.uid());
end;
$$;

revoke all on function public.ensure_athlete_user_id(uuid) from public;
grant execute on function public.ensure_athlete_user_id(uuid) to authenticated;

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
    select 1 from public.athletes a
    where a.id = p_athlete_id and a.user_id = auth.uid()
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

revoke all on function public.create_private_club(uuid, text, text, boolean, text) from public;
grant execute on function public.create_private_club(uuid, text, text, boolean, text) to authenticated;
