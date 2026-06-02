-- Weekly consistency bonus: 3-4 workouts → +10pts, 5-6 → +25pts, 7+ → +50pts
-- Awarded Monday 01:00 UTC for the just-completed Mon–Sun week.
-- Only sessions with score > 0 count as qualifying workouts.
-- Only one tier per athlete per week (the highest reached).

-- ─────────────────────────────────────────────
-- Tracking table
-- ─────────────────────────────────────────────
create table if not exists public.weekly_consistency_bonuses (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references public.athletes(id) on delete cascade,
  season_id       uuid references public.seasons(id) on delete cascade,
  week_start      date not null,   -- Monday of the scored week (UTC)
  qualifying_count integer not null,
  bonus_points    integer not null,
  awarded_at      timestamptz not null default now(),

  constraint weekly_consistency_bonuses_one_per_week
    unique (athlete_id, week_start)
);

create index if not exists weekly_consistency_bonuses_athlete_idx
  on public.weekly_consistency_bonuses (athlete_id);

-- RLS: athletes can read their own bonuses
alter table public.weekly_consistency_bonuses enable row level security;

create policy "wcb_select_own"
  on public.weekly_consistency_bonuses for select
  using (
    athlete_id = (
      select id from public.athletes where user_id = auth.uid() limit 1
    )
  );

-- ─────────────────────────────────────────────
-- Tier lookup
-- ─────────────────────────────────────────────
create or replace function public.consistency_bonus_points(p_qualifying_count integer)
returns integer
language sql
immutable
as $$
  select case
    when p_qualifying_count >= 7 then 50
    when p_qualifying_count >= 5 then 25
    when p_qualifying_count >= 3 then 10
    else 0
  end;
$$;

-- ─────────────────────────────────────────────
-- Award function — called once per athlete after each Mon–Sun week ends.
-- p_week_start must be the Monday of the completed week (UTC date).
-- ─────────────────────────────────────────────
create or replace function public.award_weekly_consistency_bonus(
  p_athlete_id uuid,
  p_week_start date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_end      date;
  v_count         integer;
  v_bonus         integer;
  v_season_id     uuid;
begin
  -- Skip if already awarded for this week
  if exists (
    select 1 from weekly_consistency_bonuses
    where athlete_id = p_athlete_id and week_start = p_week_start
  ) then
    return jsonb_build_object('status', 'already_awarded');
  end if;

  -- Week spans Monday 00:00 to Sunday 23:59 UTC
  v_week_end := p_week_start + 6;

  -- Count qualifying workouts (score > 0, capped at daily cap — already
  -- reconciled in workouts table). Both engine and run count.
  select count(distinct started_at::date)
  into v_count
  from workouts
  where athlete_id      = p_athlete_id
    and status          = 'scored'
    and (engine_score + run_score) > 0
    and started_at::date >= p_week_start
    and started_at::date <= v_week_end;

  -- NOTE: We count distinct calendar days above so a 2-session day with both
  -- scoring only counts once toward the weekly total (1 qualifying day).
  -- If you prefer counting individual sessions, replace with:
  --   count(*) ... and (engine_score + run_score) > 0

  v_bonus := public.consistency_bonus_points(v_count);

  if v_bonus = 0 then
    return jsonb_build_object('status', 'no_bonus', 'qualifying_count', v_count);
  end if;

  select id into v_season_id from seasons where is_active = true limit 1;

  -- Record the award (idempotent via unique constraint)
  insert into weekly_consistency_bonuses
    (athlete_id, season_id, week_start, qualifying_count, bonus_points)
  values
    (p_athlete_id, v_season_id, p_week_start, v_count, v_bonus)
  on conflict (athlete_id, week_start) do nothing;

  if not found then
    return jsonb_build_object('status', 'already_awarded');
  end if;

  -- Add to athlete total
  update athletes
  set total_score = total_score + v_bonus
  where id = p_athlete_id;

  -- Add to season leaderboard (use a dedicated category so it doesn't
  -- inflate engine or run scores)
  if v_season_id is not null then
    insert into athlete_stats (athlete_id, season_id, category, score)
    values (p_athlete_id, v_season_id, 'consistency', v_bonus)
    on conflict (athlete_id, season_id, category)
    do update set score = athlete_stats.score + v_bonus;
  end if;

  return jsonb_build_object(
    'status',            'awarded',
    'qualifying_count',  v_count,
    'bonus_points',      v_bonus,
    'week_start',        p_week_start
  );
end;
$$;

-- ─────────────────────────────────────────────
-- Batch function run by cron every Monday
-- ─────────────────────────────────────────────
create or replace function public.award_weekly_consistency_bonuses_for_all()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start  date;
  v_rec         record;
  v_total       integer := 0;
  v_awarded     integer := 0;
begin
  -- The most recently completed Monday–Sunday week
  -- current_date is Monday when cron fires at Mon 01:00 UTC;
  -- subtract 7 days to get last week's Monday.
  v_week_start := date_trunc('week', current_date - 1)::date;

  for v_rec in
    select id from athletes where id is not null
  loop
    v_total := v_total + 1;
    declare
      v_result jsonb;
    begin
      v_result := public.award_weekly_consistency_bonus(v_rec.id, v_week_start);
      if (v_result->>'status') = 'awarded' then
        v_awarded := v_awarded + 1;
      end if;
    exception when others then
      -- Log but don't abort the whole batch
      raise warning 'award_weekly_consistency_bonus failed for %: %', v_rec.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'athletes_processed', v_total,
    'bonuses_awarded',    v_awarded,
    'week_start',         v_week_start
  );
end;
$$;

-- ─────────────────────────────────────────────
-- Cron: runs at 01:00 UTC every Monday
-- ─────────────────────────────────────────────
create extension if not exists pg_cron with schema extensions;

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
  '0 1 * * 1',  -- 01:00 UTC every Monday
  $$select public.award_weekly_consistency_bonuses_for_all();$$
);
