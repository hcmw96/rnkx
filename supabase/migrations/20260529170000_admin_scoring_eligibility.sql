-- Admin: include status/reject_reason and all recent rows (not only status = scored).

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
            status
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
