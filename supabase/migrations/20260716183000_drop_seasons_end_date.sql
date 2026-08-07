-- end_date is unused; ends_at is the authoritative season end (NOT NULL, all app reads).

alter table public.seasons
  drop column if exists end_date;
