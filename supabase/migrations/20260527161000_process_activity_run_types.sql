-- Restrict run scoring to running activity types only.
-- Prevents cycling/walking/etc from scoring in run league even when pace is present.

create or replace function public.process_activity(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  v_old_rank integer;
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

  if exists (select 1 from workouts where source_id = v_source_id) then
    return jsonb_build_object('status', 'duplicate', 'source_id', v_source_id);
  end if;

  select age, max_hr into v_age, v_max_hr from athletes where id = v_athlete_id;
  v_effective_max_hr := coalesce(v_max_hr, 220 - v_age);

  if v_duration_min < 15 then
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
    if (
      select count(*)
      from workouts
      where athlete_id = v_athlete_id
        and status = 'scored'
        and run_score > 0
        and date_trunc('day', started_at) = date_trunc('day', v_started_at)
    ) < 2 then
      v_run_score := case
        when v_pace < 209 then v_duration_min * 5.6
        when v_pace < 240 then v_duration_min * 5.2
        when v_pace < 270 then v_duration_min * 4.7
        when v_pace < 300 then v_duration_min * 4.1
        when v_pace < 330 then v_duration_min * 3.5
        when v_pace < 360 then v_duration_min * 3.0
        when v_pace < 390 then v_duration_min * 2.6
        when v_pace < 420 then v_duration_min * 2.2
        when v_pace < 450 then v_duration_min * 1.7
        when v_pace < 480 then v_duration_min * 1.2
        when v_pace < 540 then v_duration_min * 0.7
        else 0
      end;
    end if;
  end if;

  if v_status != 'rejected' and v_run_score = 0 and v_avg_hr is not null then
    if (
      select count(*)
      from workouts
      where athlete_id = v_athlete_id
        and status = 'scored'
        and engine_score > 0
        and date_trunc('day', started_at) = date_trunc('day', v_started_at)
    ) >= 2 then
      v_engine_score := 0;
    else
      v_hr_pct := (v_avg_hr / v_effective_max_hr) * 100;

      v_engine_score := case
        when v_hr_pct >= 90 then v_duration_min * 4.8
        when v_hr_pct >= 85 then v_duration_min * 4.2
        when v_hr_pct >= 80 then v_duration_min * 3.7
        when v_hr_pct >= 75 then v_duration_min * 2.8
        when v_hr_pct >= 70 then v_duration_min * 2.0
        when v_hr_pct >= 60 then v_duration_min * 1.4
        when v_hr_pct >= 45 then v_duration_min * 0.8
        else 0
      end;

      if v_pace is not null and v_pace < 240 and v_hr_pct < 60 then
        v_status := 'rejected';
        v_reject_reason := 'implausible_pace_hr_combo';
        v_engine_score := 0;
      end if;
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
  );

  if v_status = 'scored' then
    update athletes
    set
      total_score = total_score + v_engine_score + v_run_score,
      last_synced = now()
    where id = v_athlete_id;

    select id into v_season_id from seasons where is_active = true limit 1;

    if v_season_id is not null then
      if v_engine_score > 0 then
        v_old_rank := public.category_leaderboard_rank(v_athlete_id, v_season_id, 'engine');

        insert into athlete_stats (athlete_id, season_id, category, score)
        values (v_athlete_id, v_season_id, 'engine', v_engine_score)
        on conflict (athlete_id, season_id, category)
        do update set score = athlete_stats.score + v_engine_score;

        perform public.fire_scoring_push_notifications(
          v_athlete_id,
          v_season_id,
          'engine',
          v_engine_score,
          v_old_rank
        );
      end if;

      if v_run_score > 0 then
        v_old_rank := public.category_leaderboard_rank(v_athlete_id, v_season_id, 'run');

        insert into athlete_stats (athlete_id, season_id, category, score)
        values (v_athlete_id, v_season_id, 'run', v_run_score)
        on conflict (athlete_id, season_id, category)
        do update set score = athlete_stats.score + v_run_score;

        perform public.fire_scoring_push_notifications(
          v_athlete_id,
          v_season_id,
          'run',
          v_run_score,
          v_old_rank
        );
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
$$;
