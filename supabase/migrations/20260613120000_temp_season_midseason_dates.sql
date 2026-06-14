-- Temporary: centre the active season on "today" so dashboard shows ~Day 21/42
-- instead of Day 42/42 "Ends today". Revert or replace before production season end.

update public.seasons
set
  starts_at = timezone('utc', now()) - interval '21 days',
  ends_at = timezone('utc', now()) + interval '21 days'
where is_active = true;
