-- Native in-app review prompt (Despia rateapp://): at most once per app version per athlete.
-- Stored on the athlete row because the Despia webview may clear localStorage.

alter table public.athletes
  add column if not exists in_app_review_prompted_version text;

comment on column public.athletes.in_app_review_prompted_version is
  'Despia versionNumber last used for rateapp://. Null means never prompted.';
