-- Terra wearable connections + profile display list
alter table public.athletes add column if not exists wearables text[] not null default '{}';

create table if not exists public.terra_connections (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  terra_user_id text not null unique,
  provider text not null,
  created_at timestamptz not null default now()
);

create index if not exists terra_connections_athlete_id_idx on public.terra_connections (athlete_id);

alter table public.terra_connections enable row level security;

drop policy if exists "terra_connections_select_own" on public.terra_connections;
drop policy if exists "terra_connections_no_insert" on public.terra_connections;
drop policy if exists "terra_connections_no_update" on public.terra_connections;
drop policy if exists "terra_connections_no_delete" on public.terra_connections;

-- Athletes can read their own Terra connection rows
create policy "terra_connections_select_own"
  on public.terra_connections for select
  using (
    auth.uid() = athlete_id
    or exists (
      select 1 from public.athletes a
      where a.id = terra_connections.athlete_id
        and a.user_id = auth.uid()
    )
  );

-- Inserts/updates come from service-role edge functions only (no direct client writes)
create policy "terra_connections_no_insert"
  on public.terra_connections for insert
  with check (false);

create policy "terra_connections_no_update"
  on public.terra_connections for update
  using (false);

create policy "terra_connections_no_delete"
  on public.terra_connections for delete
  using (false);
