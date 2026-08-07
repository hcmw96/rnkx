-- Proof: competition pushes stay silent when dry-run or season_push_enabled = false.
-- Season 1 id hard-coded; adjust if needed.
--
-- Expected:
--   dry-run: push_log delta 0, http_response delta 0, http_queue delta 0, promotion_history 0
--   live (rolled back): push_log delta 0, http delta 0, queue delta 0, pushes.dispatched 0

-- A) Preconditions
select enabled as season_push_enabled from public.season_push_settings where id = true;

select
  (select count(*)::bigint from public.season_push_log) as push_log,
  (select count(*)::bigint from net._http_response) as http_response,
  (select count(*)::bigint from net.http_request_queue) as http_queue,
  (select count(*)::bigint from public.promotion_history) as promotion_history;

-- B) Dry-run
select
  public.finalize_season('0ca6c2be-16e6-4d41-b527-26fefff383e4'::uuid, true)
    ->> 'status' as dry_status,
  public.finalize_season('0ca6c2be-16e6-4d41-b527-26fefff383e4'::uuid, true)
    -> 'pushes' as dry_pushes;

select
  (select count(*)::bigint from public.season_push_log) as push_log_after_dry,
  (select count(*)::bigint from net._http_response) as http_after_dry,
  (select count(*)::bigint from net.http_request_queue) as queue_after_dry,
  (select count(*)::bigint from public.promotion_history) as ph_after_dry;

-- C) Live finalize with enabled=false, aborted so writes do not stick.
--    RAISE rolls back the DO-block transaction (including promotion_history).
do $$
declare
  v_before_log bigint;
  v_before_http bigint;
  v_before_queue bigint;
  v_after_log bigint;
  v_after_http bigint;
  v_after_queue bigint;
  v_ph bigint;
  v_result jsonb;
begin
  select count(*) into v_before_log from public.season_push_log;
  select count(*) into v_before_http from net._http_response;
  select count(*) into v_before_queue from net.http_request_queue;

  v_result := public.finalize_season('0ca6c2be-16e6-4d41-b527-26fefff383e4'::uuid, false);

  select count(*) into v_after_log from public.season_push_log;
  select count(*) into v_after_http from net._http_response;
  select count(*) into v_after_queue from net.http_request_queue;
  select count(*) into v_ph from public.promotion_history;

  raise exception
    'PROOF_ROLLBACK push_log_delta=% http_delta=% queue_delta=% status=% pushes=% ph_in_txn=%',
    v_after_log - v_before_log,
    v_after_http - v_before_http,
    v_after_queue - v_before_queue,
    v_result->>'status',
    v_result->'pushes',
    v_ph;
end;
$$;

-- D) After rollback — should match preconditions
select
  (select count(*)::bigint from public.season_push_log) as push_log_final,
  (select count(*)::bigint from net._http_response) as http_final,
  (select count(*)::bigint from net.http_request_queue) as queue_final,
  (select count(*)::bigint from public.promotion_history) as ph_final;
