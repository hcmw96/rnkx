-- ALTER TABLE athletes ADD COLUMN IF NOT EXISTS max_hr_source text;

alter table public.athletes add column if not exists max_hr_source text;
alter table public.athletes add column if not exists max_hr integer;
