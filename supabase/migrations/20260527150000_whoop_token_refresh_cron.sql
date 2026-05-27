-- Cron: refresh WHOOP tokens expiring within 2 hours (every 30 minutes).
-- Requires: extensions pg_cron, pg_net, vault secret `service_role_key`.
-- Optional vault secret `supabase_url` (defaults to production project URL).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create or replace function public.invoke_whoop_token_refresh()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base text;
  v_key text;
begin
  begin
    select decrypted_secret into v_base
    from vault.decrypted_secrets
    where name = 'supabase_url'
    limit 1;
  exception
    when others then
      v_base := null;
  end;

  if v_base is null or v_base = '' then
    v_base := 'https://vuhnmlixouvghvyjwrdv.supabase.co';
  end if;

  begin
    select decrypted_secret into v_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;
  exception
    when others then
      v_key := null;
  end;

  if v_key is null or v_key = '' then
    raise warning 'invoke_whoop_token_refresh: vault secret service_role_key not set — skipping';
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_base, '/') || '/functions/v1/whoop-token-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  );
exception
  when others then
    raise warning 'invoke_whoop_token_refresh failed: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_whoop_token_refresh() from public;

-- Replace existing job if re-applied.
do $cron$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'whoop-token-refresh' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$cron$;

select cron.schedule(
  'whoop-token-refresh',
  '*/30 * * * *',
  $$select public.invoke_whoop_token_refresh();$$
);
