-- Admin dashboard: security-definer reads + explicit allowlist (username) for internal reviewers.

create or replace function public.admin_is_caller_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.athletes a
    where (a.id = auth.uid() or a.user_id = auth.uid())
      and lower(trim(coalesce(a.username, ''))) = any (
        array['sds8', 'henry', 'henryw']::text[]
      )
  );
$$;

create or replace function public.admin_assert_caller()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(public.admin_is_caller_allowed(), false) then
    return;
  end if;
  raise exception 'Forbidden' using errcode = '42501';
end;
$$;

create or replace function public.admin_get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
begin
  perform public.admin_assert_caller();

  select id into v_season_id
  from public.seasons
  where is_active = true
  order by starts_at desc
  limit 1;

  return jsonb_build_object(
    'season_id', v_season_id,
    'athletes',
    coalesce(
      (
        select jsonb_agg(row_to_json(a) order by a.total_score desc nulls last)
        from (
          select
            id,
            username,
            display_name,
            total_score,
            wearables,
            data_source,
            last_synced,
            max_hr,
            age
          from public.athletes
        ) a
      ),
      '[]'::jsonb
    ),
    'leaderboard',
    coalesce(
      (
        select jsonb_agg(row_to_json(s) order by s.score desc nulls last)
        from (
          select
            ast.athlete_id,
            ast.category,
            ast.score,
            ast.rank,
            ath.username,
            ath.display_name
          from public.athlete_stats ast
          left join public.athletes ath on ath.id = ast.athlete_id
          where ast.season_id = v_season_id
            and ast.category in ('engine', 'run')
        ) s
      ),
      '[]'::jsonb
    )
  );
end;
$$;

-- Gate existing admin RPCs the same way.
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
            run_score
          from public.workouts
          where athlete_id = p_athlete_id
            and status = 'scored'
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
            league_type
          from public.activities
          where athlete_id = p_athlete_id
            and status = 'scored'
          order by workout_start_time desc nulls last, activity_date desc
          limit v_limit
        ) a
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.admin_athlete_wearable_summary(p_athlete_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_assert_caller();

  return (
    select coalesce(
      jsonb_object_agg(
        sub.athlete_id::text,
        jsonb_build_object(
          'terra_providers', sub.terra_providers,
          'has_whoop', sub.has_whoop
        )
      ),
      '{}'::jsonb
    )
    from (
      select
        a.id as athlete_id,
        coalesce(
          array_agg(distinct tc.provider::text) filter (where tc.provider is not null),
          '{}'::text[]
        ) as terra_providers,
        exists (
          select 1
          from public.whoop_connections w
          where w.athlete_id = a.id
        ) as has_whoop
      from unnest(p_athlete_ids) as u(athlete_id)
      join public.athletes a on a.id = u.athlete_id
      left join public.terra_connections tc on tc.athlete_id = a.id
      group by a.id
    ) sub
  );
end;
$$;

revoke all on function public.admin_is_caller_allowed() from public;
revoke all on function public.admin_assert_caller() from public;
revoke all on function public.admin_get_dashboard() from public;
grant execute on function public.admin_is_caller_allowed() to authenticated;
grant execute on function public.admin_assert_caller() to authenticated;
grant execute on function public.admin_get_dashboard() to authenticated;
grant execute on function public.admin_list_athlete_recent_activity(uuid, int) to authenticated;
grant execute on function public.admin_athlete_wearable_summary(uuid[]) to authenticated;
