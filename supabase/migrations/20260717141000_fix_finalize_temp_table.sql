-- Fix: finalize_season temp table must be droppable within the same session/txn.
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

  drop table if exists _finalize_plan;
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

  insert into public.season_snapshots (athlete_id, season_id, league, division, rank, points)
  select id, season_id, league, division, rank, season_score
  from public.season_division_leaderboard
  where season_id = p_season_id
  on conflict (athlete_id, season_id, league) do update set
    division = excluded.division,
    rank = excluded.rank,
    points = excluded.points;

  get diagnostics v_snapshot_count = row_count;

  insert into public.promotion_history (
    athlete_id, season_id, league, from_division, to_division,
    result, final_rank, final_points
  )
  select
    athlete_id, p_season_id, league, from_division, to_division,
    result, final_rank, final_points
  from _finalize_plan;

  get diagnostics v_history_count = row_count;

  insert into public.athlete_divisions (athlete_id, season_id, league, division)
  select athlete_id, v_next_season_id, league, to_division
  from _finalize_plan
  on conflict (athlete_id, season_id, league) do update set
    division = excluded.division,
    updated_at = now();

  get diagnostics v_membership_count = row_count;

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
