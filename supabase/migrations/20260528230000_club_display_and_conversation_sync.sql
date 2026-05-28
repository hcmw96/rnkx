-- Reliable club name/image for chat + league views; keep conversation title in sync with club name.

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
declare
  v_conv_id uuid;
  v_new_name text;
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

  update public.private_leagues pl
  set
    name = coalesce(v_new_name, pl.name),
    image_url = coalesce(p_image_url, pl.image_url),
    is_public = coalesce(p_is_public, pl.is_public)
  where pl.id = p_league_id;

  if v_conv_id is not null and v_new_name is not null then
    update public.conversations c
    set name = v_new_name
    where c.id = v_conv_id;
  end if;
end;
$$;

create or replace function public.get_club_by_conversation(p_conversation_id uuid)
returns table (
  id uuid,
  name text,
  image_url text,
  league_type text
)
language sql
stable
security definer
set search_path = public
as $$
  select pl.id, pl.name, pl.image_url, pl.league_type
  from public.private_leagues pl
  where pl.conversation_id = p_conversation_id
    and public.user_is_conversation_member(p_conversation_id)
  limit 1;
$$;

revoke all on function public.get_club_by_conversation(uuid) from public;
grant execute on function public.get_club_by_conversation(uuid) to authenticated;

create or replace function public.get_private_league(p_league_id uuid)
returns table (
  id uuid,
  name text,
  image_url text,
  league_type text,
  created_by uuid,
  conversation_id uuid,
  invite_code text,
  is_public boolean
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
    pl.is_public
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

-- Align existing group chat titles with club names.
update public.conversations c
set name = pl.name
from public.private_leagues pl
where pl.conversation_id = c.id
  and nullif(trim(pl.name), '') is not null
  and c.name is distinct from pl.name;
