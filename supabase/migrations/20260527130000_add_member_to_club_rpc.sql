-- Add a member to a club (private_league_members + conversation_members) in one
-- security-definer RPC, bypassing RLS recursion on conversation_members.

create or replace function public.add_member_to_club(
  p_league_id uuid,
  p_athlete_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must be the club creator or be adding themselves.
  if not exists (
    select 1 from public.private_leagues pl
    join public.athletes ac on ac.id = pl.created_by
    where pl.id = p_league_id
      and (ac.user_id = auth.uid()
           or exists (
             select 1 from public.athletes self
             where self.id = p_athlete_id and self.user_id = auth.uid()
           ))
  ) then
    raise exception 'Forbidden';
  end if;

  -- Insert member (ignore if already present).
  insert into public.private_league_members (league_id, athlete_id, status)
  values (p_league_id, p_athlete_id, 'accepted')
  on conflict (league_id, athlete_id) do nothing;

  -- Also add to group chat if the club has one.
  select conversation_id into v_conv_id
  from public.private_leagues
  where id = p_league_id;

  if v_conv_id is not null then
    insert into public.conversation_members (conversation_id, athlete_id)
    values (v_conv_id, p_athlete_id)
    on conflict (conversation_id, athlete_id) do nothing;
  end if;
end;
$$;

revoke all on function public.add_member_to_club(uuid, uuid) from public;
grant execute on function public.add_member_to_club(uuid, uuid) to authenticated;
