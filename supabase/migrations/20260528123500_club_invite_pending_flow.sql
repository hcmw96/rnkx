-- Make creator-added club members pending invites instead of auto-accepted.
-- Also harden self-join rules: only public clubs, pending invites, or valid invite codes.

drop function if exists public.add_member_to_club(uuid, uuid);

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

  select pl.created_by, coalesce(pl.is_public, false), pl.conversation_id, pl.invite_code
    into v_creator_id, v_is_public, v_conv_id, v_league_invite_code
  from public.private_leagues pl
  where pl.id = p_league_id;

  if v_creator_id is null then
    raise exception 'Club not found';
  end if;

  -- Creator inviting another athlete => pending invite (no chat access yet).
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

  -- Non-creators may only act on themselves.
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

  -- Self join allowed for public clubs, pending invite rows, or matching invite link code.
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
    on conflict (conversation_id, athlete_id) do nothing;
  end if;
end;
$$;

revoke all on function public.add_member_to_club(uuid, uuid, text) from public;
grant execute on function public.add_member_to_club(uuid, uuid, text) to authenticated;
