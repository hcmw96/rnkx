-- =============================================================================
-- ONE-TIME RECALCULATION — rebuild athletes.total_score + athlete_stats(engine/run)
-- from BOTH the workouts table (Apple) AND the activities table (Terra/WHOOP/Garmin),
-- enforcing the SAME daily cap on both: max 2 scoring sessions per league per calendar day,
-- PLUS per-league weekly consistency bonuses from weekly_consistency_bonuses.
--
-- WHY: backfill_engine_workout_scores() (migration 20260626120000) rebuilt totals from
-- the workouts table ONLY, zeroing every athlete whose scores came from `activities`.
-- This restores the missing activities contribution AND makes the daily cap consistent.
--
-- Consistency bonuses live ON engine/run season rows (not category='consistency').
-- Lifetime total includes SUM(weekly_consistency_bonuses.bonus_points) for the active season.
--
-- ⚠️ Wrapped in a transaction ending in ROLLBACK. Inspect the verification output,
--    then change the final ROLLBACK to COMMIT to apply. Nothing is written until you do.
-- =============================================================================

begin;

do $$
declare
  v_season_id uuid;
begin
  select id into v_season_id from public.seasons where is_active = true limit 1;
  if v_season_id is null then
    raise exception 'no active season';
  end if;

  ---------------------------------------------------------------------------
  -- Capped activity points per (athlete, league) — top 2 per league per day.
  ---------------------------------------------------------------------------
  create temporary table _act_capped on commit drop as
  with s as (
    select
      athlete_id,
      league_type,
      coalesce(
        (timezone('Europe/London', workout_start_time))::date,
        activity_date
      ) as day,
      public.calculate_activity_score(league_type, duration_minutes, avg_hr_percent, avg_pace_seconds) as sc,
      coalesce(workout_start_time, activity_date::timestamptz) as ord_ts
    from public.activities
    where status = 'scored'
      and source <> 'apple'
  ),
  r as (
    select *,
      row_number() over (
        partition by athlete_id, league_type, day
        order by sc desc, ord_ts desc
      ) as rn
    from s
    where sc > 0
  )
  select athlete_id, league_type, sum(sc) as pts
  from r
  where rn <= 2
  group by athlete_id, league_type;

  ---------------------------------------------------------------------------
  -- Workout points per athlete (stored, already daily-capped by the live pipeline).
  ---------------------------------------------------------------------------
  create temporary table _wk on commit drop as
  select athlete_id,
         sum(coalesce(engine_score,0)) as eng,
         sum(coalesce(run_score,0))    as run
  from public.workouts
  where status = 'scored'
  group by athlete_id;

  ---------------------------------------------------------------------------
  -- Per-league consistency bonuses (ledger) for the active season
  ---------------------------------------------------------------------------
  create temporary table _bonus on commit drop as
  select athlete_id,
         coalesce(sum(bonus_points) filter (where league = 'engine'), 0) as eng_bonus,
         coalesce(sum(bonus_points) filter (where league = 'run'), 0) as run_bonus
  from public.weekly_consistency_bonuses
  where season_id = v_season_id
  group by athlete_id;

  ---------------------------------------------------------------------------
  -- 1. athletes.total_score = workouts + activities + league bonuses
  ---------------------------------------------------------------------------
  update public.athletes ath
  set total_score =
        coalesce(w.eng,0) + coalesce(w.run,0)
      + coalesce(ae.pts,0) + coalesce(ar.pts,0)
      + coalesce(b.eng_bonus,0) + coalesce(b.run_bonus,0)
  from public.athletes base
  left join _wk w          on w.athlete_id  = base.id
  left join _act_capped ae on ae.athlete_id = base.id and ae.league_type = 'engine'
  left join _act_capped ar on ar.athlete_id = base.id and ar.league_type = 'run'
  left join _bonus b       on b.athlete_id  = base.id
  where ath.id = base.id;

  ---------------------------------------------------------------------------
  -- 2. athlete_stats.engine = workouts eng + activity eng + engine bonuses
  ---------------------------------------------------------------------------
  insert into public.athlete_stats (athlete_id, season_id, category, score, recorded_at)
  select base.id, v_season_id, 'engine',
         coalesce(w.eng,0) + coalesce(ae.pts,0) + coalesce(b.eng_bonus,0),
         now()
  from public.athletes base
  left join _wk w          on w.athlete_id  = base.id
  left join _act_capped ae on ae.athlete_id = base.id and ae.league_type = 'engine'
  left join _bonus b       on b.athlete_id  = base.id
  where coalesce(w.eng,0) + coalesce(ae.pts,0) + coalesce(b.eng_bonus,0) > 0
     or exists (select 1 from public.athlete_stats s
                where s.athlete_id=base.id and s.season_id=v_season_id and s.category='engine')
  on conflict (athlete_id, season_id, category)
  do update set score = excluded.score, recorded_at = now();

  ---------------------------------------------------------------------------
  -- 3. athlete_stats.run = workouts run + activity run + run bonuses
  ---------------------------------------------------------------------------
  insert into public.athlete_stats (athlete_id, season_id, category, score, recorded_at)
  select base.id, v_season_id, 'run',
         coalesce(w.run,0) + coalesce(ar.pts,0) + coalesce(b.run_bonus,0),
         now()
  from public.athletes base
  left join _wk w          on w.athlete_id  = base.id
  left join _act_capped ar on ar.athlete_id = base.id and ar.league_type = 'run'
  left join _bonus b       on b.athlete_id  = base.id
  where coalesce(w.run,0) + coalesce(ar.pts,0) + coalesce(b.run_bonus,0) > 0
     or exists (select 1 from public.athlete_stats s
                where s.athlete_id=base.id and s.season_id=v_season_id and s.category='run')
  on conflict (athlete_id, season_id, category)
  do update set score = excluded.score, recorded_at = now();

  -- No category='consistency' rows — bonuses live on engine/run.

end $$;

select display_name, total_score
from public.athletes
order by total_score desc
limit 10;

-- If correct:   change the line below to  COMMIT;
-- If not:       leave as ROLLBACK;
rollback;
