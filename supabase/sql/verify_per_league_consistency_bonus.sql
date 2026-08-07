-- Verification for per-league consistency bonus. Returns a result row; rolls back.
begin;

create temporary table _verify_results (
  step text primary key,
  ok boolean not null,
  detail jsonb not null
) on commit drop;

do $$
declare
  v_season_id uuid := '0ca6c2be-16e6-4d41-b527-26fefff383e4';
  v_lucas uuid := 'de8fa9e8-e91f-42b9-96df-37352845504d';
  v_review uuid := 'ff6b5a10-fc43-4fa2-8071-d9c4c0007895';
  v_week date := '2026-06-29';
  v_before_lucas int;
  v_before_review int;
  v_after_lucas int;
  v_after_review int;
  v_award jsonb;
  v_rec_before timestamptz;
  v_rec_after timestamptz;
  v_score_before numeric;
  v_score_after numeric;
  v_s1 uuid;
  v_s2 uuid;
  v_s_next uuid;
  v_athlete uuid := 'de8fa9e8-e91f-42b9-96df-37352845504d';
  v_final_week date;
  v_r1 jsonb;
  v_r2 jsonb;
  v_bonus_count int;
  v_ok boolean;
begin
  -- VERIFY 1 -----------------------------------------------------------------
  select rank into v_before_lucas
  from season_division_leaderboard
  where id = v_lucas and league = 'engine' and division = 'Open';

  select rank into v_before_review
  from season_division_leaderboard
  where id = v_review and league = 'engine' and division = 'Open';

  select score, recorded_at into v_score_before, v_rec_before
  from athlete_stats
  where athlete_id = v_lucas and season_id = v_season_id and category = 'engine';

  insert into consistency_bonus_tiers (league, min_workouts, bonus_points)
  values ('engine', 1, 250)
  on conflict (league, min_workouts) do update set bonus_points = 250;

  v_award := award_weekly_consistency_bonus(v_lucas, v_season_id, 'engine', v_week);

  select rank into v_after_lucas
  from season_division_leaderboard
  where id = v_lucas and league = 'engine' and division = 'Open';

  select rank into v_after_review
  from season_division_leaderboard
  where id = v_review and league = 'engine' and division = 'Open';

  select score, recorded_at into v_score_after, v_rec_after
  from athlete_stats
  where athlete_id = v_lucas and season_id = v_season_id and category = 'engine';

  v_ok := (v_award->>'status') = 'awarded'
      and v_after_lucas < v_before_lucas
      and v_rec_before is not distinct from v_rec_after;

  insert into _verify_results values (
    '1_rank_change_and_recorded_at',
    v_ok,
    jsonb_build_object(
      'award', v_award,
      'lucas_rank_before', v_before_lucas,
      'lucas_rank_after', v_after_lucas,
      'review_rank_before', v_before_review,
      'review_rank_after', v_after_review,
      'score_before', v_score_before,
      'score_after', v_score_after,
      'recorded_at_unchanged', v_rec_before is not distinct from v_rec_after
    )
  );

  -- VERIFY 2: finalize then cron ------------------------------------------------
  insert into seasons (name, starts_at, ends_at, is_active)
  values (
    'VERIFY finalize-then-cron',
    timestamptz '2026-07-06 00:00:00+01',
    timestamptz '2026-07-13 00:00:00+01',
    false
  )
  returning id into v_s1;

  insert into workouts (
    athlete_id, source_id, started_at, duration_min, activity_type,
    engine_score, run_score, status
  ) values (
    v_athlete,
    'verify_finalize_cron_' || v_s1::text,
    timestamptz '2026-07-08 12:00:00+01',
    30,
    'verify',
    10,
    0,
    'scored'
  );

  insert into athlete_stats (athlete_id, season_id, category, score, recorded_at)
  values (v_athlete, v_s1, 'engine', 10, now())
  on conflict (athlete_id, season_id, category) do update set score = athlete_stats.score;

  v_r1 := finalize_season(v_s1);
  v_r2 := award_weekly_consistency_bonuses_for_season(v_s1, (v_r1->>'final_week_start')::date);

  v_ok := ((v_r1->'bonus'->>'awarded')::int) >= 1
      and ((v_r2->>'awarded')::int) = 0
      and ((v_r2->>'already_awarded')::int) >= 1;

  insert into _verify_results values (
    '2_finalize_then_cron',
    v_ok,
    jsonb_build_object('finalize', v_r1, 'cron_after', v_r2)
  );

  -- VERIFY 3: cron then finalize ------------------------------------------------
  insert into seasons (name, starts_at, ends_at, is_active)
  values (
    'VERIFY cron-then-finalize',
    timestamptz '2026-07-20 00:00:00+01',
    timestamptz '2026-07-27 00:00:00+01',
    false
  )
  returning id into v_s2;

  insert into workouts (
    athlete_id, source_id, started_at, duration_min, activity_type,
    engine_score, run_score, status
  ) values (
    v_athlete,
    'verify_cron_finalize_' || v_s2::text,
    timestamptz '2026-07-22 12:00:00+01',
    30,
    'verify',
    10,
    0,
    'scored'
  );

  insert into athlete_stats (athlete_id, season_id, category, score, recorded_at)
  values (v_athlete, v_s2, 'engine', 10, now())
  on conflict do nothing;

  v_final_week := london_week_start((select ends_at - interval '1 second' from seasons where id = v_s2));
  v_r1 := award_weekly_consistency_bonuses_for_season(v_s2, v_final_week);
  v_r2 := finalize_season(v_s2);

  v_ok := ((v_r1->>'awarded')::int) >= 1
      and ((v_r2->'bonus'->>'awarded')::int) = 0
      and ((v_r2->'bonus'->>'already_awarded')::int) >= 1;

  insert into _verify_results values (
    '3_cron_then_finalize',
    v_ok,
    jsonb_build_object('cron_first', v_r1, 'finalize_after', v_r2, 'final_week', v_final_week)
  );

  -- VERIFY 4: BST Sunday end — bonus on ending season, not next -----------------
  insert into seasons (name, starts_at, ends_at, is_active)
  values (
    'VERIFY next season after BST Sunday',
    timestamptz '2026-07-13 00:00:00+01',
    timestamptz '2026-08-24 00:00:00+01',
    false
  )
  returning id into v_s_next;

  select count(*) into v_bonus_count
  from weekly_consistency_bonuses
  where season_id = v_s1
    and week_start = '2026-07-06'
    and athlete_id = v_athlete
    and league = 'engine';

  v_ok := v_bonus_count >= 1
    and not exists (
      select 1 from weekly_consistency_bonuses
      where season_id = v_s_next and week_start = '2026-07-06'
    )
    and london_week_start(timestamptz '2026-07-13 00:00:00+01' - interval '1 second')
        = '2026-07-06'::date
    and season_id_for_london_week('2026-07-06'::date) is distinct from v_s_next;

  insert into _verify_results values (
    '4_bst_sunday_final_week_season',
    v_ok,
    jsonb_build_object(
      'ending_season', v_s1,
      'next_season', v_s_next,
      'final_week_start', '2026-07-06',
      'bonus_rows_on_ending', v_bonus_count,
      'week_from_ends_at_minus_1s',
        london_week_start(timestamptz '2026-07-13 00:00:00+01' - interval '1 second'),
      'resolved_season_for_week', season_id_for_london_week('2026-07-06'::date)
    )
  );
end $$;

select step, ok, detail from _verify_results order by step;

rollback;
