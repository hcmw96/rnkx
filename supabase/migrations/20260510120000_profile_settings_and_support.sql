alter table public.athletes add column if not exists health_data_sharing boolean not null default true;
alter table public.athletes add column if not exists is_public boolean not null default true;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;

create policy "support_messages_insert_own"
  on public.support_messages for insert
  with check (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.user_id = auth.uid()
    )
  );

create policy "support_messages_select_own"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.user_id = auth.uid()
    )
  );
