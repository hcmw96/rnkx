-- Invite links + join flow (public lookup by code via RPC)

alter table public.private_leagues add column if not exists invite_code text;

create unique index if not exists private_leagues_invite_code_key
  on public.private_leagues (invite_code)
  where invite_code is not null;

-- Backfill existing leagues with random codes
update public.private_leagues pl
set invite_code = lower(substr(md5(gen_random_uuid()::text), 1, 8))
where pl.invite_code is null;

alter table public.private_league_members add column if not exists invited_by uuid references public.athletes (id) on delete set null;

-- Public join preview (no direct table exposure to anon)
create or replace function public.get_private_league_for_join(p_invite_code text)
returns table (
  id uuid,
  name text,
  member_count bigint,
  conversation_id uuid
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
    pl.conversation_id
  from public.private_leagues pl
  where pl.invite_code is not null
    and pl.invite_code = p_invite_code
  limit 1;
$$;

revoke all on function public.get_private_league_for_join(text) from public;
grant execute on function public.get_private_league_for_join(text) to anon, authenticated;

-- After joining a league, allow the new member to join the league group chat
drop policy if exists "conversation_members_insert_if_league_member" on public.conversation_members;

create policy "conversation_members_insert_if_league_member"
  on public.conversation_members for insert with check (
    exists (select 1 from public.athletes a where a.id = conversation_members.athlete_id and a.user_id = auth.uid())
    and exists (
      select 1 from public.private_leagues pl
      join public.private_league_members plm
        on plm.league_id = pl.id
        and plm.athlete_id = conversation_members.athlete_id
        and plm.status = 'accepted'
      where pl.conversation_id = conversation_members.conversation_id
    )
  );
