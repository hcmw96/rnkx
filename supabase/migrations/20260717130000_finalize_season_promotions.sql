-- Finalize season: promotion/relegation from division_rules + promotion_settings.
-- Ranks: season_division_leaderboard (membership-based; same order as app).
-- Dry-run: compute plan, write nothing.

-- =============================================================================
-- 1) Membership-based division board (ranks match app + include zero-score members)
-- =============================================================================
create or replace view public.season_division_leaderboard as
select
  ad.athlete_id as id,
  a.display_name,
  ad.season_id,
  ad.league,
  ad.division,
  coalesce(ast.score, 0) as season_score,
  ast.recorded_at,
  row_number() over (
    partition by ad.season_id, ad.league, ad.division
    order by
      coalesce(ast.score, 0) desc,
      ast.recorded_at asc nulls last,
      ad.athlete_id asc
  )::integer as rank
from public.athlete_divisions ad
join public.athletes a
  on a.id = ad.athlete_id
left join public.athlete_stats ast
  on ast.athlete_id = ad.athlete_id
 and ast.season_id = ad.season_id
 and ast.category = ad.league
where ad.league in ('engine', 'run');

create or replace view public.season_overall_leaderboard as
select
  ad.athlete_id as id,
  a.display_name,
  ad.season_id,
  ad.league,
  ad.division,
  coalesce(ast.score, 0) as season_score,
  ast.recorded_at,
  row_number() over (
    partition by ad.season_id, ad.league
    order by
      coalesce(ast.score, 0) desc,
      ast.recorded_at asc nulls last,
      ad.athlete_id asc
  )::integer as rank
from public.athlete_divisions ad
join public.athletes a
  on a.id = ad.athlete_id
left join public.athlete_stats ast
  on ast.athlete_id = ad.athlete_id
 and ast.season_id = ad.season_id
 and ast.category = ad.league
where ad.league in ('engine', 'run');

grant select on public.season_division_leaderboard to anon, authenticated, service_role;
grant select on public.season_overall_leaderboard to anon, authenticated, service_role;

create or replace function public.category_leaderboard_rank(
  p_athlete_id uuid,
  p_season_id uuid,
  p_category text
)
returns integer
language sql
stable
security definer
set search_path to public
as $$
  select coalesce(
    (
      select r::integer
      from (
        select
          ad.athlete_id,
          row_number() over (
            partition by ad.division
            order by
              coalesce(ast.score, 0) desc,
              ast.recorded_at asc nulls last,
              ad.athlete_id asc
          ) as r
        from public.athlete_divisions ad
        left join public.athlete_stats ast
          on ast.athlete_id = ad.athlete_id
         and ast.season_id = ad.season_id
         and ast.category = ad.league
        where ad.season_id = p_season_id
          and ad.league = p_category
      ) ranked
      where athlete_id = p_athlete_id
    ),
    999999
  );
$$;

-- =============================================================================
-- 2) Qualifying workout count for promotion eligibility (per league, in season)
-- =============================================================================
create or replace function public.athlete_season_league_workout_count(
  p_athlete_id uuid,
  p_season_id uuid,
  p_league text
)
returns integer
language sql
stable
security definer
set search_path to public
as $$
  with bounds as (
    select starts_at, ends_at
    from public.seasons
    where id = p_season_id
  ),
  sessions as (
    select w.id
    from public.workouts w, bounds b
    where w.athlete_id = p_athlete_id
      and w.status = 'scored'
      and w.started_at >= b.starts_at
      and w.started_at < b.ends_at
      and (
        (p_league = 'engine' and coalesce(w.engine_score, 0) > 0)
        or (p_league = 'run' and coalesce(w.run_score, 0) > 0)
      )

    union

    select a.id
    from public.activities a, bounds b
    where a.athlete_id = p_athlete_id
      and a.status = 'scored'
      and a.league_type = p_league
      and coalesce(a.workout_start_time, a.activity_date::timestamptz) >= b.starts_at
      and coalesce(a.workout_start_time, a.activity_date::timestamptz) < b.ends_at
      and public.calculate_activity_score(
            a.league_type, a.duration_minutes, a.avg_hr_percent, a.avg_pace_seconds
          ) > 0
  )
  select count(*)::integer from sessions;
$$;

grant execute on function public.athlete_season_league_workout_count(uuid, uuid, text)
  to anon, authenticated, service_role;

-- =============================================================================
-- 3) Pure compute: promotion plan for a season (no writes)
-- =============================================================================
create or replace function public.compute_season_promotions(p_season_id uuid)
returns table (
  athlete_id uuid,
  display_name text,
  league text,
  from_division text,
  to_division text,
  result text,
  final_rank integer,
  final_points numeric,
  workout_count integer,
  eligible boolean
)
language plpgsql
volatile
security definer
set search_path to public
as $$
declare
  v_min_workouts integer;
  v_league text;
  v_division text;
  v_rule record;
  v_n integer;
  v_promote_slots integer;
  v_relegate_slots integer;
  v_pct_slots integer;
begin
  if p_season_id is null then
    raise exception 'compute_season_promotions: p_season_id required';
  end if;

  select min_workouts_for_promotion
  into v_min_workouts
  from public.promotion_settings
  where id = true;

  v_min_workouts := coalesce(v_min_workouts, 3);

  drop table if exists _promo_board;
  create temporary table _promo_board (
    athlete_id uuid not null,
    display_name text,
    league text not null,
    division text not null,
    rank integer not null,
    points numeric not null,
    workout_count integer not null,
    eligible boolean not null,
    result text,
    to_division text,
    primary key (athlete_id, league)
  ) on commit drop;

  insert into _promo_board (
    athlete_id, display_name, league, division, rank, points, workout_count, eligible
  )
  select
    lb.id,
    lb.display_name,
    lb.league,
    lb.division,
    lb.rank,
    lb.season_score,
    public.athlete_season_league_workout_count(lb.id, p_season_id, lb.league),
    public.athlete_season_league_workout_count(lb.id, p_season_id, lb.league) >= v_min_workouts
  from public.season_division_leaderboard lb
  where lb.season_id = p_season_id;

  -- Default: hold in place
  update _promo_board
  set result = 'held', to_division = division;

  foreach v_league in array array['engine', 'run']
  loop
    for v_division in
      select distinct b.division from _promo_board b where b.league = v_league
    loop
      select * into v_rule
      from public.division_rules
      where division = v_division;

      if v_rule.division is null then
        raise exception 'compute_season_promotions: missing division_rules for %', v_division;
      end if;

      select count(*) into v_n
      from _promo_board b
      where b.league = v_league and b.division = v_division;

      -- Promote slots from rules at execution time (never hardcoded).
      v_promote_slots := 0;
      if v_rule.promote_percent is not null and v_rule.promotes_to is not null then
        v_pct_slots := ceil(v_n * v_rule.promote_percent / 100.0)::integer;
        v_promote_slots := v_pct_slots;
        if v_rule.promote_min_count is not null then
          v_promote_slots := greatest(v_promote_slots, v_rule.promote_min_count);
        end if;
        v_promote_slots := least(v_promote_slots, v_n);
      end if;

      v_relegate_slots := 0;
      if v_rule.relegate_percent is not null and v_rule.relegates_to is not null then
        v_relegate_slots := least(
          ceil(v_n * v_rule.relegate_percent / 100.0)::integer,
          v_n
        );
      end if;

      -- Promote: eligible only, best ranks first, until slots filled.
      if v_promote_slots > 0 then
        update _promo_board b
        set result = 'promoted', to_division = v_rule.promotes_to
        where (b.athlete_id, b.league) in (
          select x.athlete_id, x.league
          from _promo_board x
          where x.league = v_league
            and x.division = v_division
            and x.eligible
          order by x.rank asc
          limit v_promote_slots
        );
      end if;

      -- Relegate: eligible not already promoted, worst ranks first.
      if v_relegate_slots > 0 then
        update _promo_board b
        set result = 'relegated', to_division = v_rule.relegates_to
        where (b.athlete_id, b.league) in (
          select x.athlete_id, x.league
          from _promo_board x
          where x.league = v_league
            and x.division = v_division
            and x.eligible
            and x.result = 'held'
          order by x.rank desc
          limit v_relegate_slots
        );
      end if;
    end loop;
  end loop;

  return query
  select
    b.athlete_id,
    b.display_name,
    b.league,
    b.division,
    b.to_division,
    b.result,
    b.rank,
    b.points,
    b.workout_count,
    b.eligible
  from _promo_board b
  order by b.league, b.division, b.rank;
end;
$$;

grant execute on function public.compute_season_promotions(uuid)
  to authenticated, service_role;

-- =============================================================================
-- 4) Resolve next season for membership writes
-- =============================================================================
create or replace function public.resolve_next_season_id(p_ending_season_id uuid)
returns uuid
language sql
stable
security definer
set search_path to public
as $$
  select s.id
  from public.seasons s
  join public.seasons ending on ending.id = p_ending_season_id
  where s.id <> ending.id
    and s.starts_at >= ending.ends_at
  order by s.starts_at asc
  limit 1;
$$;

-- =============================================================================
-- 5) finalize_season — bonus → snapshot → promote → next membership
-- =============================================================================
drop function if exists public.finalize_season(uuid);

create or replace function public.finalize_season(
  p_season_id uuid,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_ends_at timestamptz;
  v_week_start date;
  v_bonus_result jsonb;
  v_locked uuid;
  v_next_season_id uuid;
  v_min_workouts integer;
  v_plan_count integer;
  v_promoted integer;
  v_relegated integer;
  v_held integer;
  v_snapshot_count integer := 0;
  v_history_count integer := 0;
  v_membership_count integer := 0;
  v_plan jsonb;
begin
  if p_season_id is null then
    raise exception 'finalize_season: p_season_id required';
  end if;

  select id, ends_at
  into v_locked, v_ends_at
  from public.seasons
  where id = p_season_id
  for update;

  if v_locked is null then
    raise exception 'finalize_season: season % not found', p_season_id;
  end if;

  if not p_dry_run and exists (
    select 1 from public.promotion_history where season_id = p_season_id limit 1
  ) then
    raise exception 'finalize_season: promotion_history already exists for season %', p_season_id;
  end if;

  v_week_start := public.london_week_start(v_ends_at - interval '1 second');
  v_next_season_id := public.resolve_next_season_id(p_season_id);

  select min_workouts_for_promotion into v_min_workouts
  from public.promotion_settings where id = true;
  v_min_workouts := coalesce(v_min_workouts, 3);

  -- STEP 1: final-week consistency bonus (skipped on dry-run — no writes)
  if p_dry_run then
    v_bonus_result := jsonb_build_object(
      'status', 'skipped_dry_run',
      'week_start', v_week_start,
      'season_id', p_season_id
    );
  else
    v_bonus_result := public.award_weekly_consistency_bonuses_for_season(
      p_season_id, v_week_start
    );
  end if;

  -- STEP 2: compute promotions from current division board ranks (once)
  create temporary table _finalize_plan on commit drop as
  select * from public.compute_season_promotions(p_season_id);

  select jsonb_agg(row_to_json(p) order by p.league, p.from_division, p.final_rank)
  into v_plan
  from _finalize_plan p;

  v_plan := coalesce(v_plan, '[]'::jsonb);

  select
    count(*)::integer,
    count(*) filter (where result = 'promoted')::integer,
    count(*) filter (where result = 'relegated')::integer,
    count(*) filter (where result = 'held')::integer
  into v_plan_count, v_promoted, v_relegated, v_held
  from _finalize_plan;

  if p_dry_run then
    return jsonb_build_object(
      'status', 'dry_run',
      'season_id', p_season_id,
      'next_season_id', v_next_season_id,
      'final_week_start', v_week_start,
      'min_workouts_for_promotion', v_min_workouts,
      'bonus', v_bonus_result,
      'summary', jsonb_build_object(
        'total', v_plan_count,
        'promoted', v_promoted,
        'relegated', v_relegated,
        'held', v_held
      ),
      'promotions', v_plan,
      'writes', jsonb_build_object(
        'season_snapshots', 0,
        'promotion_history', 0,
        'athlete_divisions_next', 0
      )
    );
  end if;

  if v_next_season_id is null then
    raise exception
      'finalize_season: no next season after % — create the upcoming season before finalizing',
      p_season_id;
  end if;

  -- STEP 3: snapshot pre-promo standings
  insert into public.season_snapshots (athlete_id, season_id, league, division, rank, points)
  select id, season_id, league, division, rank, season_score
  from public.season_division_leaderboard
  where season_id = p_season_id
  on conflict (athlete_id, season_id, league) do update set
    division = excluded.division,
    rank = excluded.rank,
    points = excluded.points;

  get diagnostics v_snapshot_count = row_count;

  -- STEP 4: promotion_history for every athlete (including holds)
  insert into public.promotion_history (
    athlete_id, season_id, league, from_division, to_division,
    result, final_rank, final_points
  )
  select
    athlete_id, p_season_id, league, from_division, to_division,
    result, final_rank, final_points
  from _finalize_plan;

  get diagnostics v_history_count = row_count;

  -- STEP 5: next-season membership only (do not mutate ending season rows)
  insert into public.athlete_divisions (athlete_id, season_id, league, division)
  select athlete_id, v_next_season_id, league, to_division
  from _finalize_plan
  on conflict (athlete_id, season_id, league) do update set
    division = excluded.division,
    updated_at = now();

  get diagnostics v_membership_count = row_count;

  -- Ensure any athlete missing from the board still gets Open on next season
  perform public.reconcile_athlete_divisions_for_season(v_next_season_id);

  return jsonb_build_object(
    'status', 'finalized',
    'season_id', p_season_id,
    'next_season_id', v_next_season_id,
    'final_week_start', v_week_start,
    'min_workouts_for_promotion', v_min_workouts,
    'bonus', v_bonus_result,
    'summary', jsonb_build_object(
      'total', v_plan_count,
      'promoted', v_promoted,
      'relegated', v_relegated,
      'held', v_held
    ),
    'promotions', v_plan,
    'writes', jsonb_build_object(
      'season_snapshots', v_snapshot_count,
      'promotion_history', v_history_count,
      'athlete_divisions_next', v_membership_count
    )
  );
end;
$$;

grant execute on function public.finalize_season(uuid, boolean)
  to service_role;

-- Convenience: finalize_season(id) → live run (not dry-run)
create or replace function public.finalize_season(p_season_id uuid)
returns jsonb
language sql
security definer
set search_path to public
as $$
  select public.finalize_season(p_season_id, false);
$$;

grant execute on function public.finalize_season(uuid)
  to service_role;
