-- Daily Apple Watch sync reminder push at 20:00 UTC.
-- Requires: pg_cron, pg_net, vault secret `service_role_key`, and `invoke_push_notification` (20260520140000).
-- Edge function: notify-sync-reminder (ONESIGNAL_APP_ID + ONESIGNAL_API_KEY).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $cron$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'notify-sync-reminder' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$cron$;

select cron.schedule(
  'notify-sync-reminder',
  '0 20 * * *',
  $$select public.invoke_push_notification('notify-sync-reminder', '{}'::jsonb);$$
);
