-- Reschedule Apple Watch sync reminder: Sundays 18:00 UTC (was daily 20:00 UTC).
-- Requires: pg_cron, public.invoke_push_notification (vault service_role_key + supabase_url).

create extension if not exists pg_cron with schema extensions;

-- Remove prior daily job if present (name from 20260529140000_sync_reminder_cron.sql).
select cron.unschedule(jobid)
from cron.job
where jobname = 'notify-sync-reminder-daily';

-- Idempotent: also unschedule if an older name was used.
select cron.unschedule(jobid)
from cron.job
where jobname = 'sync-reminder-daily';

select cron.schedule(
  'notify-sync-reminder-sunday',
  '0 18 * * 0',
  $$select public.invoke_push_notification('notify-sync-reminder', '{}'::jsonb);$$
);
