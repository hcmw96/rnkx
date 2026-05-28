-- Fix club member visibility: members should be able to read all accepted members in their league.
-- Current production policy only allows reading own membership row, so each user sees "1 member".
-- Membership peer check uses SECURITY DEFINER to avoid RLS infinite recursion (see 20260528160000).

create or replace function public.caller_is_private_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.private_league_members plm
    inner join public.athletes a on a.id = plm.athlete_id
    where plm.league_id = p_league_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  );
$$;

revoke all on function public.caller_is_private_league_member(uuid) from public;
grant execute on function public.caller_is_private_league_member(uuid) to authenticated;

drop policy if exists "Athletes read own memberships" on public.private_league_members;
drop policy if exists "private_league_members_select" on public.private_league_members;

create policy "private_league_members_select"
  on public.private_league_members
  for select
  using (
    exists (
      select 1
      from public.athletes a
      where a.id = private_league_members.athlete_id
        and (a.user_id = auth.uid() or a.id = auth.uid())
    )
    or public.caller_is_private_league_member(league_id)
  );
