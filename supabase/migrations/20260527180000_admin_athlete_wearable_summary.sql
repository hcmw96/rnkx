-- Admin: resolve wearable sources from connection tables (bypasses per-user RLS on connections).

create or replace function public.admin_athlete_wearable_summary(p_athlete_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
  ) sub;
$$;

revoke all on function public.admin_athlete_wearable_summary(uuid[]) from public;
grant execute on function public.admin_athlete_wearable_summary(uuid[]) to authenticated;
