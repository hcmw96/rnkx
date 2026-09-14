-- Founders Club overlay: persist seen on the athlete row (Despia webview can clear localStorage).

alter table public.athletes
  add column if not exists has_seen_founders_welcome boolean not null default false;

comment on column public.athletes.has_seen_founders_welcome is
  'True after the Founders Club welcome overlay was dismissed.';
