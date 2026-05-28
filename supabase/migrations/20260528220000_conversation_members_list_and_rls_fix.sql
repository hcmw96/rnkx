-- Group chat: fix conversation_members RLS recursion and expose members via RPC.
-- Backfill conversation_members for accepted club members missing from group chat.

create or replace function public.user_is_conversation_member(p_conversation_id uuid)
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
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.athlete_id in (select public.current_athlete_ids())
  )
  into is_member;

  return coalesce(is_member, false);
end;
$$;

revoke all on function public.user_is_conversation_member(uuid) from public;
grant execute on function public.user_is_conversation_member(uuid) to authenticated;

drop policy if exists "conversation_members_select" on public.conversation_members;

create policy "conversation_members_select"
  on public.conversation_members for select
  using (
    athlete_id in (select public.current_athlete_ids())
    or public.user_is_conversation_member(conversation_id)
  );

create or replace function public.list_conversation_members(p_conversation_id uuid)
returns table (
  athlete_id uuid,
  username text,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.username, a.display_name, a.avatar_url
  from public.conversation_members cm
  join public.athletes a on a.id = cm.athlete_id
  where cm.conversation_id = p_conversation_id
    and public.user_is_conversation_member(p_conversation_id)
  order by coalesce(nullif(trim(a.display_name), ''), nullif(trim(a.username), ''), a.id::text);
$$;

revoke all on function public.list_conversation_members(uuid) from public;
grant execute on function public.list_conversation_members(uuid) to authenticated;

-- Sync accepted club members into their group conversations (idempotent).
insert into public.conversation_members (conversation_id, athlete_id)
select pl.conversation_id, plm.athlete_id
from public.private_league_members plm
join public.private_leagues pl on pl.id = plm.league_id
where pl.conversation_id is not null
  and plm.status = 'accepted'
on conflict (conversation_id, athlete_id) do nothing;
