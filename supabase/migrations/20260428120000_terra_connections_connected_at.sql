-- Rename created_at -> connected_at to match app / Terra docs naming
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'terra_connections' and column_name = 'created_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'terra_connections' and column_name = 'connected_at'
  ) then
    alter table public.terra_connections rename column created_at to connected_at;
  end if;
end $$;

alter table public.terra_connections
  add column if not exists connected_at timestamptz default now();

update public.terra_connections
set connected_at = coalesce(connected_at, now())
where connected_at is null;
