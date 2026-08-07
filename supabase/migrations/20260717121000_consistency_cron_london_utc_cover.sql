-- pg_cron on this project has no cron.job.timezone column.
-- Fire Mon 00:00 and 01:00 UTC so Monday 01:00 Europe/London is covered in both
-- GMT (UTC+0) and BST (UTC+1). Award function is idempotent per (athlete, season, league, week).

do $cron$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'award-weekly-consistency-bonuses'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$cron$;

select cron.schedule(
  'award-weekly-consistency-bonuses',
  '0 0,1 * * 1',
  $$select public.award_weekly_consistency_bonuses_for_all();$$
);
