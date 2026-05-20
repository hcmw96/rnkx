-- Push notifications after scoring (notify-workout-scored, notify-rank-change).
-- Requires: extensions pg_net + vault secret `service_role_key` (Supabase service role JWT).
-- Project URL is read from vault secret `supabase_url` or falls back to production host below.

create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_push_notification(
  p_edge_function text,
  p_body jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base text;
  v_key text;
begin
  begin
    select decrypted_secret into v_base
    from vault.decrypted_secrets
    where name = 'supabase_url'
    limit 1;
  exception
    when others then
      v_base := null;
  end;

  if v_base is null or v_base = '' then
    v_base := 'https://vuhnmlixouvghvyjwrdv.supabase.co';
  end if;

  begin
    select decrypted_secret into v_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;
  exception
    when others then
      v_key := null;
  end;

  if v_key is null or v_key = '' then
    raise warning 'invoke_push_notification: vault secret service_role_key not set — skipping %', p_edge_function;
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_base, '/') || '/functions/v1/' || p_edge_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := p_body
  );
exception
  when others then
    raise warning 'invoke_push_notification(%) failed: %', p_edge_function, sqlerrm;
end;
$$;

-- Leaderboard rank for one athlete in a season/category (1 = top).
create or replace function public.category_leaderboard_rank(
  p_athlete_id uuid,
  p_season_id uuid,
  p_category text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select r::integer
      from (
        select
          athlete_id,
          rank() over (order by score desc nulls last) as r
        from athlete_stats
        where season_id = p_season_id
          and category = p_category
      ) ranked
      where athlete_id = p_athlete_id
    ),
    999999
  );
$$;

create or replace function public.fire_scoring_push_notifications(
  p_athlete_id uuid,
  p_season_id uuid,
  p_league_type text,
  p_score numeric,
  p_old_rank integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_rank integer;
begin
  if p_athlete_id is null or p_season_id is null or p_score is null or p_score <= 0 then
    return;
  end if;

  v_new_rank := public.category_leaderboard_rank(p_athlete_id, p_season_id, p_league_type);

  perform public.invoke_push_notification(
    'notify-workout-scored',
    jsonb_build_object(
      'athlete_id', p_athlete_id::text,
      'score', round(p_score::numeric, 1),
      'league_type', p_league_type,
      'rank', v_new_rank
    )
  );

  if p_old_rank is not null and v_new_rank < p_old_rank then
    perform public.invoke_push_notification(
      'notify-rank-change',
      jsonb_build_object(
        'athlete_id', p_athlete_id::text,
        'old_rank', p_old_rank,
        'new_rank', v_new_rank,
        'league_type', p_league_type
      )
    );
  end if;
end;
$$;

-- Terra / WHOOP / Garmin: activities insert trigger
create or replace function public.on_activity_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score numeric;
  v_old_rank integer;
  v_old_score numeric;
begin
  if coalesce(new.status, 'scored') is distinct from 'scored' then
    return new;
  end if;

  v_score := public.calculate_activity_score(
    new.league_type,
    new.duration_minutes,
    new.avg_hr_percent,
    new.avg_pace_seconds
  );

  if v_score <= 0 then
    return new;
  end if;

  select coalesce(ast.score, 0)
  into v_old_score
  from athlete_stats ast
  where ast.athlete_id = new.athlete_id
    and ast.season_id = new.season_id
    and ast.category = new.league_type;

  v_old_rank := public.category_leaderboard_rank(new.athlete_id, new.season_id, new.league_type);

  update athletes
  set
    total_score = coalesce(total_score, 0) + v_score,
    last_synced = now()
  where id = new.athlete_id;

  insert into athlete_stats (athlete_id, season_id, category, score)
  values (new.athlete_id, new.season_id, new.league_type, v_score)
  on conflict (athlete_id, season_id, category)
  do update set score = athlete_stats.score + v_score;

  perform public.fire_scoring_push_notifications(
    new.athlete_id,
    new.season_id,
    new.league_type,
    v_score,
    v_old_rank
  );

  return new;
end;
$$;

-- Apple Watch: process_activity (workouts table) — mirror stats upsert + push
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
  if v_status != 'rejected' and v_pace is not null then
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
