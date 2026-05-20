-- Client-side Apple sync: use PostgREST RPC (same API path as profile load) when Edge Functions
-- are unreachable from the Despia WebView.

create or replace function public.sync_apple_workouts(p_athlete_id uuid, p_workouts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  if p_workouts is null or jsonb_typeof(p_workouts) <> 'array' then
    raise exception 'Expected workouts array';
  end if;

  for w in select value from jsonb_array_elements(p_workouts)
  loop
    v_payload := jsonb_build_object(
      'athlete_id',
      p_athlete_id,
      'source_id',
      w->>'sourceId',
      'started_at',
      w->>'startedAt',
      'duration_min',
      nullif(w->>'durationMin', '')::numeric,
      'activity_type',
      w->>'activityType',
      'avg_hr',
      nullif(w->>'avgHr', '')::numeric,
      'peak_hr',
      nullif(w->>'peakHr', '')::numeric,
      'distance_m',
      nullif(w->>'distanceM', '')::numeric,
      'avg_pace_per_km',
      nullif(w->>'avgPacePerKm', '')::numeric,
      'raw_payload',
      w
    );
    v_result := public.process_activity(v_payload);
    v_results := v_results || jsonb_build_array(v_result);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('processed', v_count, 'results', v_results);
end;
$$;

revoke all on function public.sync_apple_workouts(uuid, jsonb) from public;
grant execute on function public.sync_apple_workouts(uuid, jsonb) to authenticated;
