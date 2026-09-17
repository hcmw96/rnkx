-- Top 3 / Promoted are season-end results, not live mid-season rank.
-- Block premature inserts (old clients still evaluate live rank) and strip
-- badges that already went out before Season 1 finished.

create or replace function public.guard_season_end_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.achievement_id = 'top-3' then
    if not exists (
      select 1
      from public.season_division_leaderboard l
      join public.seasons s on s.id = l.season_id
      where l.id = new.athlete_id
        and coalesce(s.is_active, true) = false
        and l.rank <= 3
    ) then
      return null;
    end if;
  end if;

  if new.achievement_id = 'promoted' then
    if not exists (
      select 1
      from public.promotion_history ph
      where ph.athlete_id = new.athlete_id
        and ph.result = 'promoted'
    ) then
      return null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_season_end_achievements on public.athlete_achievements;
create trigger guard_season_end_achievements
  before insert on public.athlete_achievements
  for each row
  execute function public.guard_season_end_achievements();

delete from public.athlete_achievements
where achievement_id = 'top-3'
  and not exists (
    select 1
    from public.season_division_leaderboard l
    join public.seasons s on s.id = l.season_id
    where l.id = athlete_achievements.athlete_id
      and coalesce(s.is_active, true) = false
      and l.rank <= 3
  );

delete from public.athlete_achievements
where achievement_id = 'promoted'
  and not exists (
    select 1
    from public.promotion_history ph
    where ph.athlete_id = athlete_achievements.athlete_id
      and ph.result = 'promoted'
  );
