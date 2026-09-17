-- Scores count from the moment an athlete joins. Historic dumps (Terra 30-day
-- connect pull, Apple HealthKit sync, WHOOP catch-up) must not score sessions
-- that started before athletes.created_at.

create or replace function public.session_started_before_athlete_join(
  p_athlete_id uuid,
  p_started_at timestamptz
)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    p_started_at is not null
    and exists (
      select 1
      from public.athletes a
      where a.id = p_athlete_id
        and a.created_at is not null
        and p_started_at < a.created_at
    );
$$;

create or replace function public.reject_activity_before_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.session_started_before_athlete_join(new.athlete_id, new.workout_start_time) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists reject_activity_before_join on public.activities;
create trigger reject_activity_before_join
  before insert on public.activities
  for each row
  execute function public.reject_activity_before_join();

create or replace function public.process_activity(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_athlete_id uuid;
  v_source_id text;
  v_duration_min numeric;
  v_avg_hr numeric;
  v_peak_hr numeric;
  v_distance_m numeric;
  v_pace numeric;
  v_max_hr integer;
  v_age integer;
  v_effective_max_hr numeric;
  v_hr_pct numeric;
  v_engine_score numeric := 0;
  v_run_score numeric := 0;
  v_status text := 'scored';
  v_reject_reason text;
  v_activity_type text;
  v_started_at timestamptz;
  v_season_id uuid;
  v_workout_id uuid;
  v_day date;
begin
  v_athlete_id := (payload->>'athlete_id')::uuid;
  v_source_id := payload->>'source_id';
  v_duration_min := (payload->>'duration_min')::numeric;
  v_avg_hr := (payload->>'avg_hr')::numeric;
  v_peak_hr := (payload->>'peak_hr')::numeric;
  v_distance_m := (payload->>'distance_m')::numeric;
  v_pace := (payload->>'avg_pace_per_km')::numeric;
  v_activity_type := payload->>'activity_type';
  v_started_at := (payload->>'started_at')::timestamptz;
  v_day := date_trunc('day', v_started_at)::date;

  if public.session_started_before_athlete_join(v_athlete_id, v_started_at) then
    return jsonb_build_object(
      'status', 'skipped',
      'reject_reason', 'before_join',
      'engine_score', 0,
      'run_score', 0
    );
  end if;

  if exists (select 1 from workouts where source_id = v_source_id) then
    return jsonb_build_object('status', 'duplicate', 'source_id', v_source_id);
  end if;

  select age, max_hr into v_age, v_max_hr from athletes where id = v_athlete_id;
  v_effective_max_hr := coalesce(v_max_hr, 220 - v_age);

  if not public.session_duration_qualifies_for_scoring(v_duration_min) then
    v_status := 'rejected';
    v_reject_reason := 'duration_too_short';
  end if;

  if v_duration_min > 120 then
    v_duration_min := 120;
  end if;

  -- RUN first; ENGINE only when run_score = 0
  if v_status != 'rejected'
    and v_pace is not null
    and lower(v_activity_type) in ('running', 'run', 'outdoor_run', 'indoor_run', 'trail_run', 'treadmill')
  then
    v_run_score := public.run_league_session_score(v_pace, v_duration_min);
  end if;

  if v_status != 'rejected' and v_run_score = 0 and v_avg_hr is not null then
    v_hr_pct := (v_avg_hr / v_effective_max_hr) * 100;
    v_engine_score := v_duration_min * public.engine_points_per_minute(v_hr_pct);

    if v_pace is not null and v_pace < 240 and v_hr_pct < 60 then
      v_status := 'rejected';
      v_reject_reason := 'implausible_pace_hr_combo';
      v_engine_score := 0;
    end if;
  end if;

  if v_engine_score = 0 and v_run_score = 0 and v_status != 'rejected' then
    v_status := 'rejected';
    v_reject_reason := coalesce(v_reject_reason, 'no_qualifying_score');
  end if;

  insert into workouts (
    athlete_id, source_id, started_at, duration_min, activity_type,
    avg_hr, peak_hr, distance_m, avg_pace_per_km,
    engine_score, run_score, status, reject_reason, raw_payload
  )
  values (
    v_athlete_id, v_source_id, v_started_at, v_duration_min, v_activity_type,
    v_avg_hr, v_peak_hr, v_distance_m, v_pace,
    v_engine_score, v_run_score, v_status, v_reject_reason, payload
  )
  returning id into v_workout_id;

  if v_status = 'scored' then
    perform public.reconcile_daily_workout_league_cap(v_athlete_id, v_day, 'run_score');
    perform public.reconcile_daily_workout_league_cap(v_athlete_id, v_day, 'engine_score');

    select run_score, engine_score
    into v_run_score, v_engine_score
    from workouts
    where id = v_workout_id;

    update athletes
    set total_score = total_score + v_engine_score + v_run_score,
        last_synced = now()
    where id = v_athlete_id;

    select id into v_season_id from seasons where is_active = true limit 1;

    if v_season_id is not null then
      if v_engine_score > 0 then
        insert into athlete_stats (athlete_id, season_id, category, score)
        values (v_athlete_id, v_season_id, 'engine', v_engine_score)
        on conflict (athlete_id, season_id, category)
        do update set score = athlete_stats.score + v_engine_score,
                      recorded_at = now();
      end if;

      if v_run_score > 0 then
        insert into athlete_stats (athlete_id, season_id, category, score)
        values (v_athlete_id, v_season_id, 'run', v_run_score)
        on conflict (athlete_id, season_id, category)
        do update set score = athlete_stats.score + v_run_score,
                      recorded_at = now();
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'engine_score', v_engine_score,
    'run_score', v_run_score,
    'reject_reason', v_reject_reason
  );
end;
$function$;

create or replace function public.sync_apple_workouts(p_athlete_id uuid, p_workouts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count int := 0;
  v_started_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  if p_workouts is null or jsonb_typeof(p_workouts) <> 'array' then
    raise exception 'Expected workouts array';
  end if;

  for w in select value from jsonb_array_elements(p_workouts)
  loop
    v_started_at := (w->>'startedAt')::timestamptz;
    if public.session_started_before_athlete_join(p_athlete_id, v_started_at) then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object('status', 'skipped', 'reject_reason', 'before_join')
      );
      continue;
    end if;

    v_payload := jsonb_build_object(
      'athlete_id',
      p_athlete_id,
      'source_id',
      w->>'sourceId',
      'started_at',
      w->>'startedAt',
      'duration_min',
      nullif(w->>'durationMin', '')::numeric,
      'activity_type',
      w->>'activityType',
      'avg_hr',
      nullif(w->>'avgHr', '')::numeric,
      'peak_hr',
      nullif(w->>'peakHr', '')::numeric,
      'distance_m',
      nullif(w->>'distanceM', '')::numeric,
      'avg_pace_per_km',
      nullif(w->>'avgPacePerKm', '')::numeric,
      'raw_payload',
      w
    );
    v_result := public.process_activity(v_payload);
    v_results := v_results || jsonb_build_array(v_result);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('processed', v_count, 'results', v_results);
end;
$$;

revoke all on function public.sync_apple_workouts(uuid, jsonb) from public;
grant execute on function public.sync_apple_workouts(uuid, jsonb) to authenticated;

-- Reverse points already awarded for pre-join sessions, then delete those rows.
-- Delete does not fire a reverse of on_activity_inserted / process_activity scoring.

with doomed as (
  select
    a.id,
    a.athlete_id,
    a.season_id,
    a.league_type,
    public.calculate_activity_score(
      a.league_type,
      a.duration_minutes,
      a.avg_hr_percent,
      a.avg_pace_seconds
    ) as pts
  from public.activities a
  join public.athletes ath on ath.id = a.athlete_id
  where a.workout_start_time is not null
    and a.workout_start_time < ath.created_at
),
by_cat as (
  select athlete_id, season_id, league_type, sum(pts) as pts
  from doomed
  where pts > 0
  group by athlete_id, season_id, league_type
)
update public.athlete_stats ast
set
  score = greatest(0, ast.score - by_cat.pts),
  recorded_at = now()
from by_cat
where ast.athlete_id = by_cat.athlete_id
  and ast.season_id = by_cat.season_id
  and ast.category = by_cat.league_type;

with doomed as (
  select
    a.athlete_id,
    public.calculate_activity_score(
      a.league_type,
      a.duration_minutes,
      a.avg_hr_percent,
      a.avg_pace_seconds
    ) as pts
  from public.activities a
  join public.athletes ath on ath.id = a.athlete_id
  where a.workout_start_time is not null
    and a.workout_start_time < ath.created_at
),
totals as (
  select athlete_id, sum(pts) as pts
  from doomed
  where pts > 0
  group by athlete_id
)
update public.athletes ath
set total_score = greatest(0, coalesce(ath.total_score, 0) - totals.pts)
from totals
where ath.id = totals.athlete_id;

delete from public.activities a
using public.athletes ath
where a.athlete_id = ath.id
  and a.workout_start_time is not null
  and a.workout_start_time < ath.created_at;

with doomed as (
  select
    w.athlete_id,
    coalesce(w.run_score, 0) as run_pts,
    coalesce(w.engine_score, 0) as eng_pts
  from public.workouts w
  join public.athletes ath on ath.id = w.athlete_id
  where w.started_at < ath.created_at
    and coalesce(w.status, 'scored') = 'scored'
),
by_athlete as (
  select
    athlete_id,
    sum(run_pts) as run_pts,
    sum(eng_pts) as eng_pts
  from doomed
  group by athlete_id
)
update public.athletes ath
set total_score = greatest(0, coalesce(ath.total_score, 0) - (by_athlete.run_pts + by_athlete.eng_pts))
from by_athlete
where ath.id = by_athlete.athlete_id;

with doomed as (
  select
    w.athlete_id,
    sum(coalesce(w.run_score, 0)) as run_pts,
    sum(coalesce(w.engine_score, 0)) as eng_pts
  from public.workouts w
  join public.athletes ath on ath.id = w.athlete_id
  where w.started_at < ath.created_at
    and coalesce(w.status, 'scored') = 'scored'
  group by w.athlete_id
),
active_season as (
  select id from public.seasons where is_active = true limit 1
)
update public.athlete_stats ast
set
  score = greatest(0, ast.score - case when ast.category = 'run' then d.run_pts else d.eng_pts end),
  recorded_at = now()
from doomed d, active_season s
where ast.athlete_id = d.athlete_id
  and ast.season_id = s.id
  and ast.category in ('run', 'engine')
  and case when ast.category = 'run' then d.run_pts else d.eng_pts end > 0;

delete from public.workouts w
using public.athletes ath
where w.athlete_id = ath.id
  and w.started_at < ath.created_at;
