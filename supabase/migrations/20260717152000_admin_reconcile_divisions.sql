-- Admin wrapper for orphan division reconciliation (service_role-only base function).

create or replace function public.admin_reconcile_athlete_divisions(p_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_count integer;
begin
  perform public.admin_assert_caller();
  v_count := public.reconcile_athlete_divisions_for_season(p_season_id);
  return jsonb_build_object('season_id', p_season_id, 'rows_upserted', v_count);
end;
$$;

revoke all on function public.admin_reconcile_athlete_divisions(uuid) from public;
grant execute on function public.admin_reconcile_athlete_divisions(uuid) to authenticated;
