-- Direct WHOOP OAuth (bypass Terra); tokens written only by service-role edge functions
create table if not exists public.whoop_connections (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  whoop_user_id text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whoop_connections_athlete_id_key unique (athlete_id)
);

create index if not exists whoop_connections_athlete_id_idx on public.whoop_connections (athlete_id);

alter table public.whoop_connections enable row level security;

drop policy if exists "whoop_connections_select_own" on public.whoop_connections;
drop policy if exists "whoop_connections_no_insert" on public.whoop_connections;
drop policy if exists "whoop_connections_no_update" on public.whoop_connections;
drop policy if exists "whoop_connections_delete_own" on public.whoop_connections;

create policy "whoop_connections_select_own"
  on public.whoop_connections for select
  using (
    auth.uid() = athlete_id
    or exists (
      select 1 from public.athletes a
      where a.id = whoop_connections.athlete_id
        and a.user_id = auth.uid()
    )
  );

create policy "whoop_connections_no_insert"
  on public.whoop_connections for insert
  with check (false);

create policy "whoop_connections_no_update"
  on public.whoop_connections for update
  using (false);

create policy "whoop_connections_delete_own"
  on public.whoop_connections for delete
  using (
    auth.uid() = athlete_id
    or exists (
      select 1 from public.athletes a
      where a.id = whoop_connections.athlete_id
        and a.user_id = auth.uid()
    )
  );
