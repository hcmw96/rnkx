-- Season/division leaderboards + lifetime board; leave legacy `leaderboard` intact.
-- Tie-break: score desc, recorded_at asc (first to reach), athlete_id asc.
-- Membership: left join athlete_divisions, coalesce to Open (never vanish from board).

-- ---------------------------------------------------------------------------
-- recorded_at on every score change (live paths that were missing it)
-- ---------------------------------------------------------------------------
create or replace function public.on_activity_inserted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_score numeric;
  v_old_score numeric;
begin
  if coalesce(new.status, 'scored') is distinct from 'scored' then
    return new;
  end if;

  v_score := public.calculate_activity_score(
    new.league_type,
    new.duration_minutes,
    new.avg_hr_percent,
    new.avg_pace_seconds
  );

  if v_score <= 0 then
    return new;
  end if;

  select coalesce(ast.score, 0)
  into v_old_score
  from athlete_stats ast
  where ast.athlete_id = new.athlete_id
    and ast.season_id = new.season_id
    and ast.category = new.league_type;

  update athletes
  set
    total_score = coalesce(total_score, 0) + v_score,
    last_synced = now()
  where id = new.athlete_id;

  insert into athlete_stats (athlete_id, season_id, category, score, recorded_at)
  values (new.athlete_id, new.season_id, new.league_type, v_score, now())
  on conflict (athlete_id, season_id, category)
  do update set
    score = athlete_stats.score + v_score,
    recorded_at = now();

  return new;
end;
$$;

create or replace function public.award_weekly_consistency_bonus(
  p_athlete_id uuid,
  p_week_start date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_week_end      date;
  v_count         integer;
  v_bonus         integer;
  v_season_id     uuid;
begin
  if exists (
    select 1 from weekly_consistency_bonuses
    where athlete_id = p_athlete_id and week_start = p_week_start
  ) then
    return jsonb_build_object('status', 'already_awarded');
  end if;

  v_week_end := p_week_start + 6;

  select count(distinct qualifying_day)
  into v_count
  from (
    select started_at::date as qualifying_day
    from workouts
    where athlete_id = p_athlete_id
      and status = 'scored'
      and (engine_score + run_score) > 0
      and started_at::date >= p_week_start
      and started_at::date <= v_week_end

    union

    select activity_date as qualifying_day
    from activities
    where athlete_id = p_athlete_id
      and status = 'scored'
      and calculate_activity_score(league_type, duration_minutes, avg_hr_percent, avg_pace_seconds) > 0
      and activity_date >= p_week_start
      and activity_date <= v_week_end
  ) qualifying_days;

  v_bonus := public.consistency_bonus_points(v_count);

  if v_bonus = 0 then
    return jsonb_build_object('status', 'no_bonus', 'qualifying_count', v_count);
  end if;

  select id into v_season_id from seasons where is_active = true limit 1;

  insert into weekly_consistency_bonuses
    (athlete_id, season_id, week_start, qualifying_count, bonus_points)
  values
    (p_athlete_id, v_season_id, p_week_start, v_count, v_bonus)
  on conflict (athlete_id, week_start) do nothing;

  if not found then
    return jsonb_build_object('status', 'already_awarded');
  end if;

  update athletes
  set total_score = total_score + v_bonus
  where id = p_athlete_id;

  if v_season_id is not null then
    insert into athlete_stats (athlete_id, season_id, category, score, recorded_at)
    values (p_athlete_id, v_season_id, 'consistency', v_bonus, now())
    on conflict (athlete_id, season_id, category)
    do update set
      score = athlete_stats.score + v_bonus,
      recorded_at = now();
  end if;

  return jsonb_build_object(
    'status',            'awarded',
    'qualifying_count',  v_count,
    'bonus_points',      v_bonus,
    'week_start',        p_week_start
  );
end;
$$;

-- process_activity already sets recorded_at on live; reaffirm both upserts.
-- (Body kept in sync with live scoring behaviour via create or replace of upserts only
--  is fragile — patch by redefining from live with recorded_at already present.)
-- Ensure INSERT paths also stamp recorded_at explicitly when missing in older copies:
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'process_activity'
  limit 1;

  if v_def is null then
    raise notice 'process_activity not found; skipped recorded_at affirm';
    return;
  end if;

  if position('recorded_at = now()' in v_def) = 0 then
    raise exception 'process_activity missing recorded_at = now() on upserts — fix before continuing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Lifetime (profile / eventual migration off legacy `leaderboard`)
create or replace view public.lifetime_leaderboard as
select
  a.id,
  a.display_name,
  a.total_score,
  row_number() over (
    order by
      a.total_score desc nulls last,
      a.created_at asc nulls last,
      a.id asc
  )::integer as rank
from public.athletes a;

-- Division board — promotion/relegation source of truth
create or replace view public.season_division_leaderboard as
select
  ast.athlete_id as id,
  a.display_name,
  ast.season_id,
  ast.category as league,
  coalesce(ad.division, 'Open') as division,
  ast.score as season_score,
  ast.recorded_at,
  row_number() over (
    partition by ast.season_id, ast.category, coalesce(ad.division, 'Open')
    order by
      ast.score desc nulls last,
      ast.recorded_at asc nulls last,
      ast.athlete_id asc
  )::integer as rank
from public.athlete_stats ast
join public.athletes a
  on a.id = ast.athlete_id
left join public.athlete_divisions ad
  on ad.athlete_id = ast.athlete_id
 and ad.season_id = ast.season_id
 and ad.league = ast.category
where ast.category in ('engine', 'run');

-- Overall browse-only (season + league; NOT used for promotion)
create or replace view public.season_overall_leaderboard as
select
  ast.athlete_id as id,
  a.display_name,
  ast.season_id,
  ast.category as league,
  coalesce(ad.division, 'Open') as division,
  ast.score as season_score,
  ast.recorded_at,
  row_number() over (
    partition by ast.season_id, ast.category
    order by
      ast.score desc nulls last,
      ast.recorded_at asc nulls last,
      ast.athlete_id asc
  )::integer as rank
from public.athlete_stats ast
join public.athletes a
  on a.id = ast.athlete_id
left join public.athlete_divisions ad
  on ad.athlete_id = ast.athlete_id
 and ad.season_id = ast.season_id
 and ad.league = ast.category
where ast.category in ('engine', 'run');

grant select on public.lifetime_leaderboard to anon, authenticated, service_role;
grant select on public.season_division_leaderboard to anon, authenticated, service_role;
grant select on public.season_overall_leaderboard to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rank RPC — same ordering + division partition as season_division_leaderboard
-- ---------------------------------------------------------------------------
create or replace function public.category_leaderboard_rank(
  p_athlete_id uuid,
  p_season_id uuid,
  p_category text
)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (
      select r::integer
      from (
        select
          ast.athlete_id,
          row_number() over (
            partition by coalesce(ad.division, 'Open')
            order by
              ast.score desc nulls last,
              ast.recorded_at asc nulls last,
              ast.athlete_id asc
          ) as r
        from public.athlete_stats ast
        left join public.athlete_divisions ad
          on ad.athlete_id = ast.athlete_id
         and ad.season_id = ast.season_id
         and ad.league = ast.category
        where ast.season_id = p_season_id
          and ast.category = p_category
      ) ranked
      where athlete_id = p_athlete_id
    ),
    999999
  );
$$;

-- ---------------------------------------------------------------------------
-- Admin: surface athletes with season stats but no division membership
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_season_id uuid;
begin
  perform public.admin_assert_caller();

  select id into v_season_id
  from public.seasons
  where is_active = true
  order by starts_at desc
  limit 1;

  return jsonb_build_object(
    'season_id', v_season_id,
    'athletes',
    coalesce(
      (
        select jsonb_agg(row_to_json(a) order by a.total_score desc nulls last)
        from (
          select
            id,
            username,
            display_name,
            total_score,
            wearables,
            data_source,
            last_synced,
            max_hr,
            age
          from public.athletes
        ) a
      ),
      '[]'::jsonb
    ),
    'leaderboard',
    coalesce(
      (
        select jsonb_agg(row_to_json(s) order by s.score desc nulls last)
        from (
          select
            ast.athlete_id,
            ast.category,
            ast.score,
            ast.rank,
            ath.username,
            ath.display_name
          from public.athlete_stats ast
          left join public.athletes ath on ath.id = ast.athlete_id
          where ast.season_id = v_season_id
            and ast.category in ('engine', 'run')
        ) s
      ),
      '[]'::jsonb
    ),
    'missing_divisions',
    coalesce(
      (
        select jsonb_agg(row_to_json(m) order by m.username nulls last, m.athlete_id, m.league)
        from (
          select distinct
            ast.athlete_id,
            ath.username,
            ath.display_name,
            ast.category as league,
            ast.season_id
          from public.athlete_stats ast
          left join public.athletes ath on ath.id = ast.athlete_id
          where ast.season_id = v_season_id
            and ast.category in ('engine', 'run')
            and not exists (
              select 1
              from public.athlete_divisions ad
              where ad.athlete_id = ast.athlete_id
                and ad.season_id = ast.season_id
                and ad.league = ast.category
            )
        ) m
      ),
      '[]'::jsonb
    )
  );
end;
$$;
