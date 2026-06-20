-- PROPOSED — review before running. Not applied automatically.
-- Friend-based rank flip detection for notify-rank-change edge function.
--
-- Rank-change pushes are fired CLIENT-SIDE after sync (pushAfterWorkoutScored.ts),
-- NOT from fire_scoring_push_notifications / process_activity. If production still
-- invokes notify-rank-change from SQL, remove that call (see PROPOSED strip snippet below).

create table if not exists public.athlete_friend_rank_snapshots (
  athlete_low_id uuid not null references public.athletes(id) on delete cascade,
  athlete_high_id uuid not null references public.athletes(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  category text not null check (category in ('engine', 'run')),
  low_rank integer not null,
  high_rank integer not null,
  updated_at timestamptz not null default now(),
  primary key (athlete_low_id, athlete_high_id, season_id, category),
  constraint athlete_friend_rank_snapshots_order check (athlete_low_id < athlete_high_id)
);

create index if not exists athlete_friend_rank_snapshots_season_category_idx
  on public.athlete_friend_rank_snapshots (season_id, category);

comment on table public.athlete_friend_rank_snapshots is
  'Last known category leaderboard ranks for friend pairs (canonical low/high athlete id). Used by notify-rank-change to detect order flips.';

-- Optional: strip notify-rank-change from fire_scoring_push_notifications in production
-- (keep workout-scored pg_net path if desired; rank-change is client-only).
/*
create or replace function public.fire_scoring_push_notifications(
  p_athlete_id uuid,
  p_season_id uuid,
  p_category text,
  p_score numeric,
  p_old_rank integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.invoke_push_notification(
    'notify-workout-scored',
    jsonb_build_object(
      'athlete_id', p_athlete_id,
      'score', p_score,
      'league_type', p_category
    )
  );
  -- Do NOT invoke notify-rank-change here — client calls it after sync completes.
end;
$$;
*/
