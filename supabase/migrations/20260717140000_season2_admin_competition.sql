-- Season 2 placeholder + admin season/competition management RPCs & RLS.

-- =============================================================================
-- 1) Season 2 placeholder (inactive; gap after Season 1 for recovery week)
-- =============================================================================
-- Season 1 ends ~2026-08-14. Recovery week, then placeholder Season 2.
-- Name prefix [PLACEHOLDER] is intentional — client has not confirmed the calendar.

insert into public.seasons (name, starts_at, ends_at, is_active)
select
  '[PLACEHOLDER] Season 2 — calendar TBC',
  timestamptz '2026-08-21 00:00:00+01',  -- Europe/London (BST)
  timestamptz '2026-10-02 00:00:00+01',
  false
where not exists (
  select 1 from public.seasons
  where name like '[PLACEHOLDER] Season 2%'
);

-- Seed Open memberships for upcoming season (all current athletes)
do $$
declare
  v_s2 uuid;
begin
  select id into v_s2
  from public.seasons
  where name like '[PLACEHOLDER] Season 2%'
  order by starts_at
  limit 1;

  if v_s2 is not null then
    perform public.reconcile_athlete_divisions_for_season(v_s2);
  end if;
end $$;

-- =============================================================================
-- 2) Admin RLS — seasons write; history/snapshots read
-- =============================================================================
drop policy if exists seasons_admin_insert on public.seasons;
create policy seasons_admin_insert
  on public.seasons for insert
  with check (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists seasons_admin_update on public.seasons;
create policy seasons_admin_update
  on public.seasons for update
  using (coalesce(public.admin_is_caller_allowed(), false))
  with check (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists seasons_admin_delete on public.seasons;
create policy seasons_admin_delete
  on public.seasons for delete
  using (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists promotion_history_admin_select on public.promotion_history;
create policy promotion_history_admin_select
  on public.promotion_history for select
  using (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists season_snapshots_admin_select on public.season_snapshots;
create policy season_snapshots_admin_select
  on public.season_snapshots for select
  using (coalesce(public.admin_is_caller_allowed(), false));

-- =============================================================================
-- 3) Overlap helper (gaps allowed; overlaps forbidden)
-- =============================================================================
create or replace function public.seasons_overlap(
  p_starts timestamptz,
  p_ends timestamptz,
  p_exclude_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select exists (
    select 1
    from public.seasons s
    where (p_exclude_id is null or s.id is distinct from p_exclude_id)
      and s.starts_at < p_ends
      and s.ends_at > p_starts
  );
$$;

-- =============================================================================
-- 4) admin_upsert_season — London wall-clock strings → timestamptz
-- =============================================================================
create or replace function public.admin_upsert_season(
  p_id uuid,
  p_name text,
  p_starts_london text,
  p_ends_london text,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_starts timestamptz;
  v_ends timestamptz;
  v_id uuid;
  v_row public.seasons%rowtype;
begin
  perform public.admin_assert_caller();

  if p_name is null or trim(p_name) = '' then
    raise exception 'Season name is required';
  end if;

  v_starts := trim(p_starts_london)::timestamp at time zone 'Europe/London';
  v_ends := trim(p_ends_london)::timestamp at time zone 'Europe/London';

  if v_ends <= v_starts then
    raise exception 'Season end must be after start';
  end if;

  if public.seasons_overlap(v_starts, v_ends, p_id) then
    raise exception 'Season dates overlap another season (gaps are allowed; overlaps are not)';
  end if;

  if p_is_active then
    update public.seasons set is_active = false where is_active and id is distinct from p_id;
  end if;

  if p_id is null then
    insert into public.seasons (name, starts_at, ends_at, is_active)
    values (trim(p_name), v_starts, v_ends, coalesce(p_is_active, false))
    returning * into v_row;
  else
    update public.seasons
    set
      name = trim(p_name),
      starts_at = v_starts,
      ends_at = v_ends,
      is_active = coalesce(p_is_active, false)
    where id = p_id
    returning * into v_row;

    if v_row.id is null then
      raise exception 'Season % not found', p_id;
    end if;
  end if;

  v_id := v_row.id;
  perform public.reconcile_athlete_divisions_for_season(v_id);

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at,
    'is_active', v_row.is_active,
    'is_placeholder', v_row.name ilike '%[PLACEHOLDER]%'
  );
end;
$$;

revoke all on function public.admin_upsert_season(uuid, text, text, text, boolean) from public;
grant execute on function public.admin_upsert_season(uuid, text, text, text, boolean) to authenticated;

-- =============================================================================
-- 5) admin_delete_season
-- =============================================================================
create or replace function public.admin_delete_season(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_name text;
  v_active boolean;
begin
  perform public.admin_assert_caller();

  select name, is_active into v_name, v_active
  from public.seasons where id = p_id;

  if v_name is null then
    raise exception 'Season not found';
  end if;

  if v_active then
    raise exception 'Cannot delete the active season';
  end if;

  if exists (select 1 from public.promotion_history where season_id = p_id) then
    raise exception 'Cannot delete a season with promotion history';
  end if;

  if exists (select 1 from public.season_snapshots where season_id = p_id) then
    raise exception 'Cannot delete a season with snapshots';
  end if;

  delete from public.athlete_divisions where season_id = p_id;
  delete from public.athlete_stats where season_id = p_id;
  delete from public.weekly_consistency_bonuses where season_id = p_id;
  delete from public.seasons where id = p_id;

  return jsonb_build_object('deleted', p_id, 'name', v_name);
end;
$$;

revoke all on function public.admin_delete_season(uuid) from public;
grant execute on function public.admin_delete_season(uuid) to authenticated;

-- =============================================================================
-- 6) admin_finalize_season — authenticated wrapper around finalize_season
-- =============================================================================
create or replace function public.admin_finalize_season(
  p_season_id uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.admin_assert_caller();
  return public.finalize_season(p_season_id, coalesce(p_dry_run, true));
end;
$$;

revoke all on function public.admin_finalize_season(uuid, boolean) from public;
grant execute on function public.admin_finalize_season(uuid, boolean) to authenticated;

-- Also allow authenticated to call finalize_season dry-run path only via wrapper above.
-- Keep direct finalize_season(service_role) as-is.

-- =============================================================================
-- 7) admin_list_competition_meta — seasons + rules + tiers in one call
-- =============================================================================
create or replace function public.admin_list_competition_meta()
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
begin
  perform public.admin_assert_caller();

  return jsonb_build_object(
    'seasons',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'starts_at', s.starts_at,
            'ends_at', s.ends_at,
            'is_active', s.is_active,
            'is_placeholder', s.name ilike '%[PLACEHOLDER]%'
          )
          order by s.starts_at
        )
        from public.seasons s
      ),
      '[]'::jsonb
    ),
    'division_rules',
    coalesce(
      (
        select jsonb_agg(row_to_json(d) order by
          case d.division
            when 'Open' then 1
            when 'Challenger' then 2
            when 'Pro' then 3
            else 4
          end
        )
        from public.division_rules d
      ),
      '[]'::jsonb
    ),
    'promotion_settings',
    (
      select row_to_json(p)
      from public.promotion_settings p
      where p.id = true
    ),
    'consistency_bonus_tiers',
    coalesce(
      (
        select jsonb_agg(row_to_json(t) order by t.league, t.min_workouts)
        from public.consistency_bonus_tiers t
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.admin_list_competition_meta() from public;
grant execute on function public.admin_list_competition_meta() to authenticated;

-- =============================================================================
-- 8) admin_update_division_rule / settings / tiers
-- =============================================================================
create or replace function public.admin_update_division_rule(
  p_division text,
  p_promote_percent numeric,
  p_promote_min_count integer,
  p_relegate_percent numeric,
  p_promotes_to text,
  p_relegates_to text
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_row public.division_rules%rowtype;
begin
  perform public.admin_assert_caller();

  update public.division_rules
  set
    promote_percent = p_promote_percent,
    promote_min_count = p_promote_min_count,
    relegate_percent = p_relegate_percent,
    promotes_to = nullif(p_promotes_to, ''),
    relegates_to = nullif(p_relegates_to, ''),
    updated_at = now()
  where division = p_division
  returning * into v_row;

  if v_row.division is null then
    raise exception 'Unknown division %', p_division;
  end if;

  return row_to_json(v_row)::jsonb;
end;
$$;

revoke all on function public.admin_update_division_rule(text, numeric, integer, numeric, text, text) from public;
grant execute on function public.admin_update_division_rule(text, numeric, integer, numeric, text, text) to authenticated;

create or replace function public.admin_update_promotion_settings(p_min_workouts integer)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_row public.promotion_settings%rowtype;
begin
  perform public.admin_assert_caller();

  if p_min_workouts is null or p_min_workouts < 0 then
    raise exception 'min_workouts_for_promotion must be >= 0';
  end if;

  update public.promotion_settings
  set min_workouts_for_promotion = p_min_workouts, updated_at = now()
  where id = true
  returning * into v_row;

  return row_to_json(v_row)::jsonb;
end;
$$;

revoke all on function public.admin_update_promotion_settings(integer) from public;
grant execute on function public.admin_update_promotion_settings(integer) to authenticated;

create or replace function public.admin_upsert_consistency_tier(
  p_league text,
  p_min_workouts integer,
  p_bonus_points integer
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_row public.consistency_bonus_tiers%rowtype;
begin
  perform public.admin_assert_caller();

  if p_league not in ('engine', 'run') then
    raise exception 'Invalid league';
  end if;
  if p_min_workouts is null or p_min_workouts <= 0 then
    raise exception 'min_workouts must be > 0';
  end if;
  if p_bonus_points is null or p_bonus_points < 0 then
    raise exception 'bonus_points must be >= 0';
  end if;

  insert into public.consistency_bonus_tiers (league, min_workouts, bonus_points)
  values (p_league, p_min_workouts, p_bonus_points)
  on conflict (league, min_workouts) do update set
    bonus_points = excluded.bonus_points,
    updated_at = now()
  returning * into v_row;

  return row_to_json(v_row)::jsonb;
end;
$$;

revoke all on function public.admin_upsert_consistency_tier(text, integer, integer) from public;
grant execute on function public.admin_upsert_consistency_tier(text, integer, integer) to authenticated;

create or replace function public.admin_delete_consistency_tier(
  p_league text,
  p_min_workouts integer
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
begin
  perform public.admin_assert_caller();
  delete from public.consistency_bonus_tiers
  where league = p_league and min_workouts = p_min_workouts;
  return jsonb_build_object('deleted', true, 'league', p_league, 'min_workouts', p_min_workouts);
end;
$$;

revoke all on function public.admin_delete_consistency_tier(text, integer) from public;
grant execute on function public.admin_delete_consistency_tier(text, integer) to authenticated;
