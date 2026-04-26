-- Optional columns for onboarding + profile (run on remote Supabase if not already present)
alter table public.athletes add column if not exists username text;
alter table public.athletes add column if not exists date_of_birth date;
alter table public.athletes add column if not exists gender text;
alter table public.athletes add column if not exists country text;
alter table public.athletes add column if not exists selected_leagues text[] default array['engine', 'run']::text[];
alter table public.athletes add column if not exists user_id uuid;

create unique index if not exists athletes_username_lower_key on public.athletes (lower(username));
