-- Production hotfix: remove self-referential RLS on private_league_members / private_leagues.
-- SECURITY DEFINER helpers disable row_security inside the function body.

create or replace function public.current_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id
  from public.athletes a
  where a.user_id = auth.uid() or a.id = auth.uid();
$$;

revoke all on function public.current_athlete_ids() from public;
grant execute on function public.current_athlete_ids() to authenticated;

create or replace function public.caller_is_private_league_member(p_league_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_member boolean;
begin
  perform set_config('row_security', 'off', true);

  select exists (
    select 1
    from public.private_league_members plm
    where plm.league_id = p_league_id
      and plm.athlete_id in (select public.current_athlete_ids())
  )
  into is_member;

  return coalesce(is_member, false);
end;
$$;

create or replace function public.caller_private_league_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);

  return query
    select distinct plm.league_id
    from public.private_league_members plm
    where plm.athlete_id in (select public.current_athlete_ids());
end;
$$;

revoke all on function public.caller_is_private_league_member(uuid) from public;
grant execute on function public.caller_is_private_league_member(uuid) to authenticated;

revoke all on function public.caller_private_league_ids() from public;
grant execute on function public.caller_private_league_ids() to authenticated;

drop policy if exists "Athletes read own memberships" on public.private_league_members;
drop policy if exists "private_league_members_select" on public.private_league_members;

create policy "private_league_members_select"
  on public.private_league_members
  for select
  using (
    athlete_id in (select public.current_athlete_ids())
    or public.caller_is_private_league_member(league_id)
  );

drop policy if exists "private_leagues_select_member" on public.private_leagues;

create policy "private_leagues_select_member"
  on public.private_leagues
  for select
  using (
    created_by in (select public.current_athlete_ids())
    or id in (select public.caller_private_league_ids())
  );
