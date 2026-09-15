-- Enforce club gender on every membership write (RPC, invites, and table inserts).

create or replace function public.enforce_club_gender_on_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_gender text;
  v_athlete_gender text;
begin
  select lower(trim(coalesce(pl.gender, 'mixed')))
    into v_club_gender
  from public.private_leagues pl
  where pl.id = new.league_id;

  if v_club_gender is null then
    raise exception 'Club not found';
  end if;

  if v_club_gender = 'mixed' then
    return new;
  end if;

  select nullif(lower(trim(a.gender)), '')
    into v_athlete_gender
  from public.athletes a
  where a.id = new.athlete_id;

  if v_athlete_gender is distinct from v_club_gender then
    if v_club_gender = 'male' then
      raise exception 'This club is for men only';
    elsif v_club_gender = 'female' then
      raise exception 'This club is for women only';
    else
      raise exception 'Gender mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists private_league_members_club_gender on public.private_league_members;

create trigger private_league_members_club_gender
  before insert or update of athlete_id, league_id, status
  on public.private_league_members
  for each row
  execute function public.enforce_club_gender_on_membership();

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
    lower(trim(coalesce(pl.gender, 'mixed')))
  into v_creator_id, v_is_public, v_conv_id, v_league_invite_code, v_club_gender
  from public.private_leagues pl
  where pl.id = p_league_id;

  if v_creator_id is null then
    raise exception 'Club not found';
  end if;

  select nullif(lower(trim(a.gender)), '')
    into v_athlete_gender
  from public.athletes a
  where a.id = p_athlete_id;

  if v_club_gender <> 'mixed' then
    if v_athlete_gender is distinct from v_club_gender then
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
