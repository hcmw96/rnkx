-- Dedupe same workout synced from multiple Terra providers (same athlete + start instant)
alter table public.activities add column if not exists workout_start_time timestamptz;

create unique index if not exists activities_athlete_id_workout_start_time_key
  on public.activities (athlete_id, workout_start_time);
