-- Per-league weekly consistency bonus → division standings.
-- Calendar: Europe/London throughout (weeks Mon–Sun London; cron Mon 01:00 London).
-- recorded_at: set on athlete_stats INSERT only; never updated by bonus awards.

-- =============================================================================
-- 0) Helpers (London calendar)
-- =============================================================================
create or replace function public.london_week_start(p_ts timestamptz)
returns date
language sql
immutable
as $$
  select date_trunc('week', timezone('Europe/London', p_ts)::timestamp)::date;
$$;

create or replace function public.london_today()
returns date
language sql
stable
as $$
  select timezone('Europe/London', now())::date;
$$;

-- Season that owns a completed Mon–Sun London week (by week_start Monday).
create or replace function public.season_id_for_london_week(p_week_start date)
returns uuid
language sql
stable
security definer
set search_path to public
as $$
  select s.id
  from public.seasons s
  where p_week_start >= public.london_week_start(s.starts_at)
    and p_week_start <= public.london_week_start(s.ends_at - interval '1 second')
  order by s.starts_at desc
  limit 1;
$$;

-- =============================================================================
-- 1) REVERSE first (from live consistency rows), then truncate ledger
-- =============================================================================
do $$
declare
  r record;
  v_reversed integer := 0;
begin
  for r in
    select athlete_id, season_id, score::numeric as amt
    from public.athlete_stats
    where category = 'consistency'
      and score > 0
  loop
    update public.athletes
    set total_score = greatest(0, coalesce(total_score, 0) - r.amt)
    where id = r.athlete_id;

    v_reversed := v_reversed + 1;
    raise notice 'reversed consistency % pts for athlete % season %',
      r.amt, r.athlete_id, r.season_id;
  end loop;

  delete from public.athlete_stats where category = 'consistency';

  raise notice 'reversed % consistency athlete_stats row(s); truncating weekly_consistency_bonuses',
    v_reversed;
end $$;

truncate table public.weekly_consistency_bonuses;

-- =============================================================================
-- 2) Schema: add league; unique (athlete_id, season_id, league, week_start)
-- =============================================================================
alter table public.weekly_consistency_bonuses
  drop constraint if exists weekly_consistency_bonuses_one_per_week;

alter table public.weekly_consistency_bonuses
  add column if not exists league text;

alter table public.weekly_consistency_bonuses
  alter column season_id set not null;

alter table public.weekly_consistency_bonuses
  alter column league set not null;

alter table public.weekly_consistency_bonuses
  drop constraint if exists weekly_consistency_bonuses_league_check;

alter table public.weekly_consistency_bonuses
  add constraint weekly_consistency_bonuses_league_check
  check (league in ('engine', 'run'));

alter table public.weekly_consistency_bonuses
  add constraint weekly_consistency_bonuses_one_per_week_league
  unique (athlete_id, season_id, league, week_start);

create index if not exists weekly_consistency_bonuses_season_league_idx
  on public.weekly_consistency_bonuses (season_id, league, week_start);

-- =============================================================================
-- 3) Admin-editable tiers (per league) — division_rules pattern
-- =============================================================================
create table if not exists public.consistency_bonus_tiers (
  league text not null check (league in ('engine', 'run')),
  min_workouts integer not null check (min_workouts > 0),
  bonus_points integer not null check (bonus_points >= 0),
  updated_at timestamptz not null default now(),
  primary key (league, min_workouts)
);

drop trigger if exists consistency_bonus_tiers_set_updated_at on public.consistency_bonus_tiers;
create trigger consistency_bonus_tiers_set_updated_at
  before update on public.consistency_bonus_tiers
  for each row
  execute function public.set_updated_at();

insert into public.consistency_bonus_tiers (league, min_workouts, bonus_points)
values
  ('engine', 3, 10),
  ('engine', 5, 25),
  ('engine', 7, 50),
  ('run', 3, 10),
  ('run', 5, 25),
  ('run', 7, 50)
on conflict (league, min_workouts) do update set
  bonus_points = excluded.bonus_points,
  updated_at = now();

alter table public.consistency_bonus_tiers enable row level security;

drop policy if exists consistency_bonus_tiers_select_public on public.consistency_bonus_tiers;
create policy consistency_bonus_tiers_select_public
  on public.consistency_bonus_tiers for select
  using (true);

drop policy if exists consistency_bonus_tiers_admin_insert on public.consistency_bonus_tiers;
create policy consistency_bonus_tiers_admin_insert
  on public.consistency_bonus_tiers for insert
  with check (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists consistency_bonus_tiers_admin_update on public.consistency_bonus_tiers;
create policy consistency_bonus_tiers_admin_update
  on public.consistency_bonus_tiers for update
  using (coalesce(public.admin_is_caller_allowed(), false))
  with check (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists consistency_bonus_tiers_admin_delete on public.consistency_bonus_tiers;
create policy consistency_bonus_tiers_admin_delete
  on public.consistency_bonus_tiers for delete
  using (coalesce(public.admin_is_caller_allowed(), false));

grant select on public.consistency_bonus_tiers to anon, authenticated, service_role;
grant all on public.consistency_bonus_tiers to service_role;

-- =============================================================================
-- 4) Tier lookup (replace hardcoded function)
-- =============================================================================
drop function if exists public.consistency_bonus_points(integer);

create or replace function public.consistency_bonus_points(
  p_league text,
  p_qualifying_count integer
)
returns integer
language sql
stable
security definer
set search_path to public
as $$
  select coalesce(
    (
      select max(t.bonus_points)
      from public.consistency_bonus_tiers t
      where t.league = p_league
        and t.min_workouts <= p_qualifying_count
    ),
    0
  );
$$;

grant execute on function public.consistency_bonus_points(text, integer)
  to anon, authenticated, service_role;

-- =============================================================================
-- 5) Award functions (per league → athlete_stats.engine|run)
-- =============================================================================
drop function if exists public.award_weekly_consistency_bonus(uuid, date);

create or replace function public.award_weekly_consistency_bonus(
  p_athlete_id uuid,
  p_season_id uuid,
  p_league text,
  p_week_start date
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_week_end date;
  v_count integer;
  v_bonus integer;
  v_rows integer := 0;
begin
  if p_league not in ('engine', 'run') then
    raise exception 'award_weekly_consistency_bonus: invalid league %', p_league;
  end if;

  if p_season_id is null then
    raise exception 'award_weekly_consistency_bonus: p_season_id is required';
  end if;

  if exists (
    select 1
    from public.weekly_consistency_bonuses
    where athlete_id = p_athlete_id
      and season_id = p_season_id
      and league = p_league
      and week_start = p_week_start
  ) then
    return jsonb_build_object(
      'status', 'already_awarded',
      'league', p_league,
      'week_start', p_week_start,
      'season_id', p_season_id
    );
  end if;

  v_week_end := p_week_start + 6;

  -- Qualifying = distinct London calendar days with >0 score in that league.
  select count(distinct qualifying_day)
  into v_count
  from (
    select (timezone('Europe/London', started_at))::date as qualifying_day
    from public.workouts
    where athlete_id = p_athlete_id
      and status = 'scored'
      and (
        (p_league = 'engine' and coalesce(engine_score, 0) > 0)
        or (p_league = 'run' and coalesce(run_score, 0) > 0)
      )
      and (timezone('Europe/London', started_at))::date >= p_week_start
      and (timezone('Europe/London', started_at))::date <= v_week_end

    union

    select coalesce(
      (timezone('Europe/London', workout_start_time))::date,
      activity_date
    ) as qualifying_day
    from public.activities
    where athlete_id = p_athlete_id
      and status = 'scored'
      and league_type = p_league
      and public.calculate_activity_score(
            league_type, duration_minutes, avg_hr_percent, avg_pace_seconds
          ) > 0
      and coalesce(
            (timezone('Europe/London', workout_start_time))::date,
            activity_date
          ) >= p_week_start
      and coalesce(
            (timezone('Europe/London', workout_start_time))::date,
            activity_date
          ) <= v_week_end
  ) qualifying_days;

  v_bonus := public.consistency_bonus_points(p_league, v_count);

  if v_bonus = 0 then
    return jsonb_build_object(
      'status', 'no_bonus',
      'league', p_league,
      'qualifying_count', v_count,
      'week_start', p_week_start,
      'season_id', p_season_id
    );
  end if;

  insert into public.weekly_consistency_bonuses
    (athlete_id, season_id, league, week_start, qualifying_count, bonus_points)
  values
    (p_athlete_id, p_season_id, p_league, p_week_start, v_count, v_bonus)
  on conflict (athlete_id, season_id, league, week_start) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object(
      'status', 'already_awarded',
      'league', p_league,
      'week_start', p_week_start,
      'season_id', p_season_id
    );
  end if;

  -- Lifetime aggregate
  update public.athletes
  set total_score = coalesce(total_score, 0) + v_bonus
  where id = p_athlete_id;

  -- Division board: bonus lands on the league row.
  -- recorded_at: INSERT only (qualifying workouts guarantee the row exists;
  -- if somehow missing, INSERT stamps recorded_at; UPDATE leaves it alone).
  insert into public.athlete_stats (athlete_id, season_id, category, score, recorded_at)
  values (p_athlete_id, p_season_id, p_league, v_bonus, now())
  on conflict (athlete_id, season_id, category)
  do update set
    score = athlete_stats.score + excluded.score;
    -- recorded_at intentionally NOT updated

  return jsonb_build_object(
    'status', 'awarded',
    'league', p_league,
    'qualifying_count', v_count,
    'bonus_points', v_bonus,
    'week_start', p_week_start,
    'season_id', p_season_id
  );
end;
$$;

grant execute on function public.award_weekly_consistency_bonus(uuid, uuid, text, date)
  to anon, authenticated, service_role;

create or replace function public.award_weekly_consistency_bonuses_for_season(
  p_season_id uuid,
  p_week_start date
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_rec record;
  v_league text;
  v_result jsonb;
  v_total integer := 0;
  v_awarded integer := 0;
  v_already integer := 0;
  v_none integer := 0;
begin
  if p_season_id is null then
    raise exception 'award_weekly_consistency_bonuses_for_season: p_season_id required';
  end if;

  for v_rec in select id from public.athletes
  loop
    foreach v_league in array array['engine', 'run']
    loop
      v_total := v_total + 1;
      begin
        v_result := public.award_weekly_consistency_bonus(
          v_rec.id, p_season_id, v_league, p_week_start
        );
        case v_result->>'status'
          when 'awarded' then v_awarded := v_awarded + 1;
          when 'already_awarded' then v_already := v_already + 1;
          else v_none := v_none + 1;
        end case;
      exception when others then
        raise warning 'award_weekly_consistency_bonus failed athlete=% league=%: %',
          v_rec.id, v_league, sqlerrm;
      end;
    end loop;
  end loop;

  return jsonb_build_object(
    'season_id', p_season_id,
    'week_start', p_week_start,
    'attempts', v_total,
    'awarded', v_awarded,
    'already_awarded', v_already,
    'no_bonus', v_none
  );
end;
$$;

grant execute on function public.award_weekly_consistency_bonuses_for_season(uuid, date)
  to anon, authenticated, service_role;

create or replace function public.award_weekly_consistency_bonuses_for_all()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_week_start date;
  v_season_id uuid;
begin
  -- Cron fires Monday 01:00 Europe/London → award the just-completed London week.
  v_week_start := public.london_week_start(now()) - 7;
  v_season_id := public.season_id_for_london_week(v_week_start);

  if v_season_id is null then
    return jsonb_build_object(
      'status', 'skipped_no_season',
      'week_start', v_week_start
    );
  end if;

  return public.award_weekly_consistency_bonuses_for_season(v_season_id, v_week_start)
    || jsonb_build_object('source', 'cron');
end;
$$;

grant execute on function public.award_weekly_consistency_bonuses_for_all()
  to anon, authenticated, service_role;

-- =============================================================================
-- 6) Cron: Monday 01:00 Europe/London
-- =============================================================================
do $cron$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'award-weekly-consistency-bonuses'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$cron$;

select cron.schedule(
  'award-weekly-consistency-bonuses',
  '0 1 * * 1',
  $$select public.award_weekly_consistency_bonuses_for_all();$$
);

-- Prefer London timezone on the job when the column exists (pg_cron ≥ 1.4).
-- This project may lack cron.job.timezone — see follow-up migration that covers
-- Mon 00:00 and 01:00 UTC instead (BST + GMT).
do $tz$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'cron'
      and table_name = 'job'
      and column_name = 'timezone'
  ) then
    update cron.job
    set timezone = 'Europe/London'
    where jobname = 'award-weekly-consistency-bonuses';
  end if;
end
$tz$;

-- =============================================================================
-- 7) finalize_season — step 2 (final-week bonus) wired; promotion stubbed
-- =============================================================================
create or replace function public.finalize_season(p_season_id uuid)
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

  -- Final London week owned by this season (week containing ends_at − 1s).
  v_week_start := public.london_week_start(v_ends_at - interval '1 second');

  -- STEP 1 (product): award final week BEFORE standings / zeroing / activate next.
  v_bonus_result := public.award_weekly_consistency_bonuses_for_season(
    p_season_id, v_week_start
  );

  -- STEP 2–N: promotion / snapshots / activate next — STUBBED
  return jsonb_build_object(
    'status', 'bonus_awarded_promotion_stubbed',
    'season_id', p_season_id,
    'final_week_start', v_week_start,
    'bonus', v_bonus_result,
    'promotion', jsonb_build_object('status', 'stubbed')
  );
end;
$$;

grant execute on function public.finalize_season(uuid)
  to service_role;

-- =============================================================================
-- 8) Admin RPC — bonus-inclusive league scores + ledger breakdown
-- =============================================================================
create or replace function public.admin_get_athlete_season_scores(p_athlete_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_season_id uuid;
  v_total numeric;
  v_engine numeric := 0;
  v_run numeric := 0;
  v_engine_consistency numeric := 0;
  v_run_consistency numeric := 0;
begin
  perform public.admin_assert_caller();

  select id into v_season_id
  from public.seasons
  where is_active = true
  order by starts_at desc
  limit 1;

  select coalesce(total_score, 0)
  into v_total
  from public.athletes
  where id = p_athlete_id;

  if v_season_id is not null then
    select coalesce(max(score) filter (where category = 'engine'), 0),
           coalesce(max(score) filter (where category = 'run'), 0)
    into v_engine, v_run
    from public.athlete_stats
    where athlete_id = p_athlete_id
      and season_id = v_season_id
      and category in ('engine', 'run');

    select coalesce(sum(bonus_points) filter (where league = 'engine'), 0),
           coalesce(sum(bonus_points) filter (where league = 'run'), 0)
    into v_engine_consistency, v_run_consistency
    from public.weekly_consistency_bonuses
    where athlete_id = p_athlete_id
      and season_id = v_season_id;
  end if;

  return jsonb_build_object(
    'season_id', v_season_id,
    'total_score', coalesce(v_total, 0),
    'engine_score', coalesce(v_engine, 0),
    'run_score', coalesce(v_run, 0),
    'engine_consistency_bonus', coalesce(v_engine_consistency, 0),
    'run_consistency_bonus', coalesce(v_run_consistency, 0),
    -- Deprecated alias: total consistency across leagues (not additive on top of engine/run)
    'consistency_bonus',
      coalesce(v_engine_consistency, 0) + coalesce(v_run_consistency, 0)
  );
end;
$$;
