-- Fix sync reminder cron: 20260619120000 never unscheduled the daily job named
-- `notify-sync-reminder` (only looked for notify-sync-reminder-daily). That left
-- a daily 20:00 UTC push with Sunday-deadline copy firing Mon–Sat.
-- Keep a single job: Sundays 18:00 UTC.

create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname in (
  'notify-sync-reminder',
  'notify-sync-reminder-daily',
  'sync-reminder-daily',
  'notify-sync-reminder-sunday'
);

select cron.schedule(
  'notify-sync-reminder-sunday',
  '0 18 * * 0',
  $$select public.invoke_push_notification('notify-sync-reminder', '{}'::jsonb);$$
);
