-- Persist achievement unlocks and celebration state per athlete.

create table if not exists public.athlete_achievements (
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  celebrated_at timestamptz,
  primary key (athlete_id, achievement_id),
  constraint athlete_achievements_id_check check (
    achievement_id in (
      'founder',
      'century',
      'engine-room',
      'pacemaker',
      'double-day',
      'iron-week',
      'promoted',
      'top-3',
      'recruiter'
    )
  )
);

create index if not exists athlete_achievements_athlete_id_idx
  on public.athlete_achievements (athlete_id);

alter table public.athlete_achievements enable row level security;

create policy "athlete_achievements_select_own"
  on public.athlete_achievements for select
  using (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.user_id = auth.uid()
    )
  );

create policy "athlete_achievements_insert_own"
  on public.athlete_achievements for insert
  with check (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.user_id = auth.uid()
    )
  );

create policy "athlete_achievements_update_own"
  on public.athlete_achievements for update
  using (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.user_id = auth.uid()
    )
  );
