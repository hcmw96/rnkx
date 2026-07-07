-- Run manually in Supabase SQL editor if migrations are not applied yet.
-- Cross-athlete rejected / zero-score feed for admin dashboard (allowlist-gated).

create or replace function public.admin_get_athlete_season_scores(p_athlete_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
  v_total numeric;
  v_engine numeric := 0;
  v_run numeric := 0;
  v_consistency numeric := 0;
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
           coalesce(max(score) filter (where category = 'run'), 0),
           coalesce(max(score) filter (where category = 'consistency'), 0)
    into v_engine, v_run, v_consistency
    from public.athlete_stats
    where athlete_id = p_athlete_id
      and season_id = v_season_id
      and category in ('engine', 'run', 'consistency');
  end if;

  return jsonb_build_object(
    'season_id', v_season_id,
    'total_score', coalesce(v_total, 0),
    'engine_score', coalesce(v_engine, 0),
    'run_score', coalesce(v_run, 0),
    'consistency_bonus', coalesce(v_consistency, 0)
  );
end;
$$;

create or replace function public.admin_list_athlete_recent_activity(
  p_athlete_id uuid,
  p_limit int default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  perform public.admin_assert_caller();

  return jsonb_build_object(
    'workouts',
    coalesce(
      (
        select jsonb_agg(row_to_json(w) order by w.started_at desc)
        from (
          select
            id,
            started_at,
            activity_type,
            duration_min,
            avg_hr,
            avg_pace_per_km,
            engine_score,
            run_score,
            status,
            reject_reason
          from public.workouts
          where athlete_id = p_athlete_id
          order by started_at desc
          limit v_limit
        ) w
      ),
      '[]'::jsonb
    ),
    'activities',
    coalesce(
      (
        select jsonb_agg(row_to_json(a) order by a.activity_date desc)
        from (
          select
            id,
            activity_date,
            activity_type,
            duration_minutes,
            avg_hr_percent,
            avg_pace_seconds,
            league_type,
            status,
            public.calculate_activity_score(
              league_type,
              duration_minutes,
              avg_hr_percent,
              avg_pace_seconds
            ) as computed_score
          from public.activities
          where athlete_id = p_athlete_id
          order by workout_start_time desc nulls last, activity_date desc
          limit v_limit
        ) a
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.admin_list_recent_rejected_activity(p_limit int default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  perform public.admin_assert_caller();

  return coalesce(
    (
      select jsonb_agg(row_to_json(u) order by u.occurred_at desc)
      from (
        select *
        from (
          select
            'workout'::text as row_kind,
            w.id,
            w.athlete_id,
            coalesce(ath.username, ath.display_name, left(w.athlete_id::text, 8)) as athlete_label,
            w.started_at as occurred_at,
            w.activity_type,
            w.duration_min as duration_minutes,
            w.avg_hr,
            null::numeric as avg_hr_percent,
            w.avg_pace_per_km as pace_seconds,
            w.engine_score,
            w.run_score,
            null::text as league_type,
            null::numeric as computed_score,
            w.status,
            w.reject_reason
          from public.workouts w
          join public.athletes ath on ath.id = w.athlete_id
          where lower(coalesce(w.status, '')) = 'rejected'
             or (
               coalesce(w.engine_score, 0) + coalesce(w.run_score, 0) = 0
               and lower(coalesce(w.status, '')) <> 'pending'
             )

          union all

          select
            'activity'::text as row_kind,
            a.id,
            a.athlete_id,
            coalesce(ath.username, ath.display_name, left(a.athlete_id::text, 8)) as athlete_label,
            coalesce(a.workout_start_time, a.activity_date::timestamptz) as occurred_at,
            a.activity_type,
            a.duration_minutes,
            null::numeric as avg_hr,
            a.avg_hr_percent,
            a.avg_pace_seconds as pace_seconds,
            null::numeric as engine_score,
            null::numeric as run_score,
            a.league_type,
            public.calculate_activity_score(
              a.league_type,
              a.duration_minutes,
              a.avg_hr_percent,
              a.avg_pace_seconds
            ) as computed_score,
            a.status,
            null::text as reject_reason
          from public.activities a
          join public.athletes ath on ath.id = a.athlete_id
          where lower(coalesce(a.status, '')) = 'rejected'
             or public.calculate_activity_score(
                  a.league_type,
                  a.duration_minutes,
                  a.avg_hr_percent,
                  a.avg_pace_seconds
                ) = 0
        ) combined
        order by occurred_at desc
        limit v_limit
      ) u
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.admin_get_athlete_season_scores(uuid) from public;
revoke all on function public.admin_list_recent_rejected_activity(int) from public;
grant execute on function public.admin_get_athlete_season_scores(uuid) to authenticated;
grant execute on function public.admin_list_recent_rejected_activity(int) to authenticated;
