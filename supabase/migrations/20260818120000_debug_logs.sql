-- TEMPORARY: Apple HealthKit connect probe diagnostics. Drop this table when done.

create table public.debug_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  athlete_id uuid,
  event text,
  detail jsonb
);

comment on table public.debug_logs is
  'TEMPORARY Apple connect probe diagnostics. Remove after debugging.';

alter table public.debug_logs enable row level security;

-- Client inserts only; read via dashboard / service_role.
create policy "debug_logs_insert"
  on public.debug_logs for insert
  to anon, authenticated
  with check (true);
