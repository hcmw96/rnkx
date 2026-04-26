-- Athletes
create table athletes (
  id            uuid primary key references auth.users(id),
  display_name  text not null,
  age           integer not null default 30,
  max_hr        integer,                    -- user-editable, null = use formula (220 - age)
  total_score   numeric not null default 0,
  last_synced   timestamptz,
  data_source   text not null default 'apple', -- 'apple' | 'terra'
  created_at    timestamptz default now()
);

alter table athletes enable row level security;
create policy "Read all"   on athletes for select using (true);
create policy "Insert own" on athletes for insert with check (auth.uid() = id);
create policy "Update own" on athletes for update using (auth.uid() = id);

-- Workouts
create table workouts (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references athletes(id),
  source_id       text not null unique,         -- dedup key
  started_at      timestamptz not null,
  duration_min    numeric not null,
  activity_type   text,                          -- e.g. 'running', 'cycling', 'HKWorkoutActivityTypeRunning'
  avg_hr          numeric,
  peak_hr         numeric,
  distance_m      numeric,
  avg_pace_per_km numeric,                       -- seconds per km
  engine_score    numeric not null default 0,
  run_score       numeric not null default 0,
  score           numeric generated always as (engine_score + run_score) stored,
  status          text not null default 'pending', -- 'scored' | 'rejected' | 'pending'
  reject_reason   text,
  raw_payload     jsonb,                         -- store original wearable data for debugging
  created_at      timestamptz default now()
);

alter table workouts enable row level security;
create policy "Read own workouts" on workouts for select using (auth.uid() = athlete_id);
create policy "Insert own workouts" on workouts for insert with check (auth.uid() = athlete_id);

-- Seasons
create table seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  is_active   boolean not null default false
);

-- Leaderboard view
create or replace view leaderboard as
select
  a.id,
  a.display_name,
  a.total_score,
  rank() over (order by a.total_score desc) as rank
from athletes a;

-- process_activity function
create or replace function process_activity(payload jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_athlete_id    uuid;
  v_source_id     text;
  v_duration_min  numeric;
  v_avg_hr        numeric;
  v_peak_hr       numeric;
  v_distance_m    numeric;
  v_pace          numeric;
  v_max_hr        integer;
  v_age           integer;
  v_effective_max_hr numeric;
  v_hr_pct        numeric;
  v_engine_score  numeric := 0;
  v_run_score     numeric := 0;
  v_status        text := 'scored';
  v_reject_reason text;
  v_activity_type text;
  v_started_at    timestamptz;
begin
  -- Extract fields
  v_athlete_id   := (payload->>'athlete_id')::uuid;
  v_source_id    := payload->>'source_id';
  v_duration_min := (payload->>'duration_min')::numeric;
  v_avg_hr       := (payload->>'avg_hr')::numeric;
  v_peak_hr      := (payload->>'peak_hr')::numeric;
  v_distance_m   := (payload->>'distance_m')::numeric;
  v_pace         := (payload->>'avg_pace_per_km')::numeric;  -- seconds/km
  v_activity_type := payload->>'activity_type';
  v_started_at   := (payload->>'started_at')::timestamptz;

  -- Dedup: if source_id already exists, return early
  if exists (select 1 from workouts where source_id = v_source_id) then
    return jsonb_build_object('status', 'duplicate', 'source_id', v_source_id);
  end if;

  -- Get athlete max HR
  select age, max_hr into v_age, v_max_hr from athletes where id = v_athlete_id;
  v_effective_max_hr := coalesce(v_max_hr, 220 - v_age);

  -- Minimum duration check
  if v_duration_min < 15 then
    v_status := 'rejected';
    v_reject_reason := 'duration_too_short';
  end if;

  -- Cap duration at 120 min for scoring
  if v_duration_min > 120 then
    v_duration_min := 120;
  end if;

  -- Daily cap check (max 2 scored per league per day)
  -- Engine
  if v_status != 'rejected' and (
    select count(*) from workouts
    where athlete_id = v_athlete_id
      and status = 'scored'
      and engine_score > 0
      and date_trunc('day', started_at) = date_trunc('day', v_started_at)
  ) >= 2 then
    v_engine_score := 0;  -- don't reject, just zero engine score
  end if;

  -- ENGINE LEAGUE SCORING
  if v_status != 'rejected' and v_avg_hr is not null then
    v_hr_pct := (v_avg_hr / v_effective_max_hr) * 100;

    v_engine_score := case
      when v_hr_pct >= 90 then v_duration_min * 4.8
      when v_hr_pct >= 80 then v_duration_min * 3.2
      when v_hr_pct >= 70 then v_duration_min * 2.0
      when v_hr_pct >= 60 then v_duration_min * 1.4
      when v_hr_pct >= 45 then v_duration_min * 0.8   -- Apple Watch relaxed band
      else 0
    end;

    -- Anomaly check: physiologically implausible combos
    if v_pace is not null and v_pace < 240 and v_hr_pct < 60 then
      -- Sprint pace + low HR = reject
      v_status := 'rejected';
      v_reject_reason := 'implausible_pace_hr_combo';
    end if;
  end if;

  -- RUN LEAGUE SCORING
  if v_status != 'rejected' and v_pace is not null then
    -- Require avg speed >= 1.5 m/s (pace <= 667 sec/km)
    if v_pace <= 667 then
      -- Daily cap for run league
      if (
        select count(*) from workouts
        where athlete_id = v_athlete_id
          and status = 'scored'
          and run_score > 0
          and date_trunc('day', started_at) = date_trunc('day', v_started_at)
      ) < 2 then
        v_run_score := case
          when v_pace < 210  then v_duration_min * 5.6   -- sub 3:30/km
          when v_pace < 240  then v_duration_min * 4.8   -- 3:30–3:59
          when v_pace < 270  then v_duration_min * 4.0   -- 4:00–4:29
          when v_pace < 300  then v_duration_min * 3.4   -- 4:30–4:59
          when v_pace < 330  then v_duration_min * 2.8   -- 5:00–5:29
          when v_pace < 360  then v_duration_min * 2.3   -- 5:30–5:59
          when v_pace < 420  then v_duration_min * 1.9   -- 6:00–6:59
          when v_pace < 480  then v_duration_min * 1.5   -- 7:00–7:59
          when v_pace < 540  then v_duration_min * 1.1   -- 8:00–8:59
          when v_pace <= 720 then v_duration_min * 0.4   -- 9:01–12:00 (needs >= 65% HR)
          else 0
        end;

        -- Slowest band requires >= 65% HR
        if v_pace >= 540 and (v_hr_pct is null or v_hr_pct < 65) then
          v_run_score := 0;
        end if;
      end if;
    end if;
  end if;

  -- If no score at all, reject
  if v_engine_score = 0 and v_run_score = 0 and v_status != 'rejected' then
    v_status := 'rejected';
    v_reject_reason := coalesce(v_reject_reason, 'no_qualifying_score');
  end if;

  -- Insert workout
  insert into workouts (
    athlete_id, source_id, started_at, duration_min, activity_type,
    avg_hr, peak_hr, distance_m, avg_pace_per_km,
    engine_score, run_score, status, reject_reason, raw_payload
  ) values (
    v_athlete_id, v_source_id, v_started_at, v_duration_min, v_activity_type,
    v_avg_hr, v_peak_hr, v_distance_m, v_pace,
    v_engine_score, v_run_score, v_status, v_reject_reason, payload
  );

  -- Update athlete total score
  if v_status = 'scored' then
    update athletes
    set total_score = total_score + v_engine_score + v_run_score,
        last_synced = now()
    where id = v_athlete_id;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'engine_score', v_engine_score,
    'run_score', v_run_score,
    'reject_reason', v_reject_reason
  );
end;
$$;
