-- Season / competition push wiring.
-- All OneSignal fan-out is gated by season_push_settings.enabled (default false).
-- Ledger season_push_log is the one-shot guarantee; cron timing is not.

-- =============================================================================
-- 1) Settings + ledger
-- =============================================================================
create table if not exists public.season_push_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.season_push_settings (id, enabled)
values (true, false)
on conflict (id) do nothing;

comment on column public.season_push_settings.enabled is
  'Master kill switch (season_push_enabled). Default false — no invoke_push_notification from competition paths.';

alter table public.season_push_settings enable row level security;

drop policy if exists season_push_settings_admin_select on public.season_push_settings;
create policy season_push_settings_admin_select
  on public.season_push_settings for select
  using (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists season_push_settings_admin_update on public.season_push_settings;
create policy season_push_settings_admin_update
  on public.season_push_settings for update
  using (coalesce(public.admin_is_caller_allowed(), false));

grant select on public.season_push_settings to authenticated, service_role;
grant update on public.season_push_settings to authenticated, service_role;

create table if not exists public.season_push_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  season_id uuid references public.seasons (id) on delete cascade,
  week_start date,
  athlete_id uuid references public.athletes (id) on delete cascade,
  league text,
  fired_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb,
  constraint season_push_log_kind_check check (
    kind = any (array[
      'start_tminus2',
      'ending_tminus2',
      'new_season',
      'weekly_update',
      'bonus_unlocked',
      'promotion',
      'relegation'
    ])
  ),
  constraint season_push_log_league_check check (
    league is null or league = any (array['engine', 'run'])
  )
);

comment on table public.season_push_log is
  'One-shot ledger for competition pushes. Uniqueness — not cron cadence — prevents double sends.';

create unique index if not exists season_push_log_season_kind_uidx
  on public.season_push_log (season_id, kind)
  where season_id is not null
    and athlete_id is null
    and week_start is null;

create unique index if not exists season_push_log_week_kind_uidx
  on public.season_push_log (week_start, kind)
  where week_start is not null
    and athlete_id is null;

create unique index if not exists season_push_log_athlete_event_uidx
  on public.season_push_log (athlete_id, season_id, kind, coalesce(league, ''), coalesce(week_start, 'epoch'::date))
  where athlete_id is not null;

create index if not exists season_push_log_fired_at_idx
  on public.season_push_log (fired_at desc);

alter table public.season_push_log enable row level security;

drop policy if exists season_push_log_admin_select on public.season_push_log;
create policy season_push_log_admin_select
  on public.season_push_log for select
  using (coalesce(public.admin_is_caller_allowed(), false));

grant select on public.season_push_log to authenticated, service_role;
grant insert, delete on public.season_push_log to service_role;

-- Arm timestamps: window must not have opened before the edit that armed the push.
alter table public.seasons
  add column if not exists start_tminus2_armed_at timestamptz,
  add column if not exists ending_tminus2_armed_at timestamptz,
  add column if not exists new_season_armed_at timestamptz;

-- Existing seasons: arm now so future T−2 windows can fire; already-open windows stay suppressed.
update public.seasons
set
  start_tminus2_armed_at = coalesce(start_tminus2_armed_at, now()),
  ending_tminus2_armed_at = coalesce(ending_tminus2_armed_at, now()),
  new_season_armed_at = coalesce(new_season_armed_at, now())
where start_tminus2_armed_at is null
   or ending_tminus2_armed_at is null
   or new_season_armed_at is null;

-- =============================================================================
-- 2) Helpers
-- =============================================================================
create or replace function public.season_push_enabled()
returns boolean
language sql
stable
security definer
set search_path to public
as $$
  select coalesce(
    (select s.enabled from public.season_push_settings s where s.id = true),
    false
  );
$$;

grant execute on function public.season_push_enabled() to authenticated, service_role;

create or replace function public.try_claim_season_push(
  p_kind text,
  p_season_id uuid default null,
  p_week_start date default null,
  p_athlete_id uuid default null,
  p_league text default null,
  p_meta jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path to public
as $$
declare
  v_id uuid;
begin
  insert into public.season_push_log (kind, season_id, week_start, athlete_id, league, meta)
  values (p_kind, p_season_id, p_week_start, p_athlete_id, p_league, coalesce(p_meta, '{}'::jsonb))
  on conflict do nothing
  returning id into v_id;

  return v_id is not null;
end;
$$;

grant execute on function public.try_claim_season_push(text, uuid, date, uuid, text, jsonb)
  to service_role;

create or replace function public.season_push_arm_preview(
  p_starts timestamptz,
  p_ends timestamptz,
  p_armed_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_now timestamptz := now();
  v_start_open timestamptz;
  v_end_open timestamptz;
  v_warnings jsonb := '[]'::jsonb;
  v_fires jsonb := '[]'::jsonb;
begin
  if p_starts is null or p_ends is null then
    return jsonb_build_object('warnings', v_warnings, 'fires', v_fires);
  end if;

  v_start_open := p_starts - interval '2 days';
  v_end_open := p_ends - interval '2 days';

  -- Start T−2
  if v_now >= v_start_open and v_now < p_starts then
    if v_start_open < p_armed_at then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'kind', 'start_tminus2',
        'suppressed', true,
        'reason', 'T−2 start window was already open before this save — start reminder will not fire.',
        'window_opens_at', v_start_open,
        'window_closes_at', p_starts
      ));
    else
      v_fires := v_fires || jsonb_build_array(jsonb_build_object(
        'kind', 'start_tminus2',
        'fires_from', greatest(v_start_open, p_armed_at),
        'fires_until', p_starts
      ));
    end if;
  elsif v_now < v_start_open then
    v_fires := v_fires || jsonb_build_array(jsonb_build_object(
      'kind', 'start_tminus2',
      'fires_from', v_start_open,
      'fires_until', p_starts
    ));
  end if;

  -- Ending T−2
  if v_now >= v_end_open and v_now < p_ends then
    if v_end_open < p_armed_at then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'kind', 'ending_tminus2',
        'suppressed', true,
        'reason', 'T−2 ending window was already open before this save — ending reminder will not fire.',
        'window_opens_at', v_end_open,
        'window_closes_at', p_ends
      ));
    else
      v_fires := v_fires || jsonb_build_array(jsonb_build_object(
        'kind', 'ending_tminus2',
        'fires_from', greatest(v_end_open, p_armed_at),
        'fires_until', p_ends
      ));
    end if;
  elsif v_now < v_end_open then
    v_fires := v_fires || jsonb_build_array(jsonb_build_object(
      'kind', 'ending_tminus2',
      'fires_from', v_end_open,
      'fires_until', p_ends
    ));
  end if;

  -- New season (day-of start, 24h claim window)
  if v_now >= p_starts and v_now < p_starts + interval '1 day' then
    if p_starts < p_armed_at then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'kind', 'new_season',
        'suppressed', true,
        'reason', 'Season start was already in the past relative to this save — new-season push will not fire.',
        'window_opens_at', p_starts,
        'window_closes_at', p_starts + interval '1 day'
      ));
    else
      v_fires := v_fires || jsonb_build_array(jsonb_build_object(
        'kind', 'new_season',
        'fires_from', p_starts,
        'fires_until', p_starts + interval '1 day'
      ));
    end if;
  elsif v_now < p_starts then
    v_fires := v_fires || jsonb_build_array(jsonb_build_object(
      'kind', 'new_season',
      'fires_from', p_starts,
      'fires_until', p_starts + interval '1 day'
    ));
  end if;

  return jsonb_build_object('warnings', v_warnings, 'fires', v_fires, 'armed_at', p_armed_at);
end;
$$;

grant execute on function public.season_push_arm_preview(timestamptz, timestamptz, timestamptz)
  to authenticated, service_role;

create or replace function public.admin_preview_season_push(
  p_starts_london text,
  p_ends_london text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to public
as $$
declare
  v_starts timestamptz;
  v_ends timestamptz;
begin
  perform public.admin_assert_caller();
  if p_starts_london is null or trim(p_starts_london) = '' then
    return jsonb_build_object('warnings', '[]'::jsonb, 'fires', '[]'::jsonb);
  end if;
  if p_ends_london is null or trim(p_ends_london) = '' then
    return jsonb_build_object('warnings', '[]'::jsonb, 'fires', '[]'::jsonb);
  end if;
  v_starts := trim(p_starts_london)::timestamp at time zone 'Europe/London';
  v_ends := trim(p_ends_london)::timestamp at time zone 'Europe/London';
  return public.season_push_arm_preview(v_starts, v_ends, now())
    || jsonb_build_object('season_push_enabled', public.season_push_enabled());
end;
$$;

revoke all on function public.admin_preview_season_push(text, text) from public;
grant execute on function public.admin_preview_season_push(text, text) to authenticated;

-- =============================================================================
-- 3) admin_upsert_season — arm on date change + return push preview
-- =============================================================================
create or replace function public.admin_upsert_season(
  p_id uuid,
  p_name text,
  p_starts_london text,
  p_ends_london text,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_starts timestamptz;
  v_ends timestamptz;
  v_id uuid;
  v_row public.seasons%rowtype;
  v_prev_starts timestamptz;
  v_prev_ends timestamptz;
  v_armed_at timestamptz := now();
  v_dates_changed boolean := true;
  v_preview jsonb;
begin
  perform public.admin_assert_caller();

  if p_name is null or trim(p_name) = '' then
    raise exception 'Season name is required';
  end if;

  v_starts := trim(p_starts_london)::timestamp at time zone 'Europe/London';
  v_ends := trim(p_ends_london)::timestamp at time zone 'Europe/London';

  if v_ends <= v_starts then
    raise exception 'Season end must be after start';
  end if;

  if public.seasons_overlap(v_starts, v_ends, p_id) then
    raise exception 'Season dates overlap another season (gaps are allowed; overlaps are not)';
  end if;

  if p_is_active then
    update public.seasons set is_active = false where is_active and id is distinct from p_id;
  end if;

  if p_id is null then
    insert into public.seasons (
      name, starts_at, ends_at, is_active,
      start_tminus2_armed_at, ending_tminus2_armed_at, new_season_armed_at
    )
    values (
      trim(p_name), v_starts, v_ends, coalesce(p_is_active, false),
      v_armed_at, v_armed_at, v_armed_at
    )
    returning * into v_row;
  else
    select starts_at, ends_at into v_prev_starts, v_prev_ends
    from public.seasons
    where id = p_id;

    if not found then
      raise exception 'Season % not found', p_id;
    end if;

    v_dates_changed :=
      v_prev_starts is distinct from v_starts
      or v_prev_ends is distinct from v_ends;

    update public.seasons
    set
      name = trim(p_name),
      starts_at = v_starts,
      ends_at = v_ends,
      is_active = coalesce(p_is_active, false),
      start_tminus2_armed_at = case
        when v_dates_changed then v_armed_at
        else coalesce(start_tminus2_armed_at, v_armed_at)
      end,
      ending_tminus2_armed_at = case
        when v_dates_changed then v_armed_at
        else coalesce(ending_tminus2_armed_at, v_armed_at)
      end,
      new_season_armed_at = case
        when v_dates_changed then v_armed_at
        else coalesce(new_season_armed_at, v_armed_at)
      end
    where id = p_id
    returning * into v_row;
  end if;

  v_id := v_row.id;
  perform public.reconcile_athlete_divisions_for_season(v_id);

  -- Preview uses the arm timestamp that applies to this save.
  v_preview := public.season_push_arm_preview(
    v_row.starts_at,
    v_row.ends_at,
    coalesce(v_row.start_tminus2_armed_at, v_armed_at)
  );

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'starts_at', v_row.starts_at,
    'ends_at', v_row.ends_at,
    'is_active', v_row.is_active,
    'is_placeholder', v_row.name ilike '%[PLACEHOLDER]%',
    'dates_changed', v_dates_changed,
    'push_preview', v_preview,
    'season_push_enabled', public.season_push_enabled()
  );
end;
$$;

revoke all on function public.admin_upsert_season(uuid, text, text, text, boolean) from public;
grant execute on function public.admin_upsert_season(uuid, text, text, text, boolean) to authenticated;

-- =============================================================================
-- 4) Dispatcher — every 15 minutes (T−2 start, T−2 ending, new season)
-- =============================================================================
create or replace function public.dispatch_season_pushes()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_now timestamptz := now();
  v_rec record;
  v_claimed boolean;
  v_start_open timestamptz;
  v_end_open timestamptz;
  v_dispatched integer := 0;
  v_skipped integer := 0;
begin
  if not public.season_push_enabled() then
    return jsonb_build_object(
      'status', 'disabled',
      'dispatched', 0,
      'skipped', 0,
      'at', v_now
    );
  end if;

  for v_rec in
    select id, name, starts_at, ends_at,
           start_tminus2_armed_at, ending_tminus2_armed_at, new_season_armed_at
    from public.seasons
  loop
    -- Start T−2
    v_start_open := v_rec.starts_at - interval '2 days';
    if v_now >= v_start_open
       and v_now < v_rec.starts_at
       and v_rec.start_tminus2_armed_at is not null
       and v_start_open >= v_rec.start_tminus2_armed_at
    then
      v_claimed := public.try_claim_season_push(
        'start_tminus2', v_rec.id, null, null, null,
        jsonb_build_object('season_name', v_rec.name, 'starts_at', v_rec.starts_at)
      );
      if v_claimed then
        perform public.invoke_push_notification(
          'notify-season-starting',
          jsonb_build_object('season_id', v_rec.id, 'kind', 'start_tminus2')
        );
        v_dispatched := v_dispatched + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    end if;

    -- Ending T−2
    v_end_open := v_rec.ends_at - interval '2 days';
    if v_now >= v_end_open
       and v_now < v_rec.ends_at
       and v_rec.ending_tminus2_armed_at is not null
       and v_end_open >= v_rec.ending_tminus2_armed_at
    then
      v_claimed := public.try_claim_season_push(
        'ending_tminus2', v_rec.id, null, null, null,
        jsonb_build_object('season_name', v_rec.name, 'ends_at', v_rec.ends_at)
      );
      if v_claimed then
        perform public.invoke_push_notification(
          'notify-season-ending',
          jsonb_build_object('season_id', v_rec.id, 'kind', 'ending_tminus2')
        );
        v_dispatched := v_dispatched + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    end if;

    -- New season (day-of, 24h window)
    if v_now >= v_rec.starts_at
       and v_now < v_rec.starts_at + interval '1 day'
       and v_rec.new_season_armed_at is not null
       and v_rec.starts_at >= v_rec.new_season_armed_at
    then
      v_claimed := public.try_claim_season_push(
        'new_season', v_rec.id, null, null, null,
        jsonb_build_object('season_name', v_rec.name, 'starts_at', v_rec.starts_at)
      );
      if v_claimed then
        perform public.invoke_push_notification(
          'notify-new-season',
          jsonb_build_object('season_id', v_rec.id, 'kind', 'new_season')
        );
        v_dispatched := v_dispatched + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'ok',
    'dispatched', v_dispatched,
    'skipped', v_skipped,
    'at', v_now
  );
end;
$$;

grant execute on function public.dispatch_season_pushes() to service_role;

do $cron$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'season-push-dispatcher'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'season-push-dispatcher',
    '*/15 * * * *',
    $$select public.dispatch_season_pushes();$$
  );
end
$cron$;

-- =============================================================================
-- 5) Weekly update — ledger (week_start, kind); dual cron safe
-- =============================================================================
create or replace function public.award_weekly_consistency_bonuses_for_all()
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_week_start date;
  v_season_id uuid;
  v_result jsonb;
  v_claimed boolean;
begin
  v_week_start := public.london_week_start(now()) - 7;
  v_season_id := public.season_id_for_london_week(v_week_start);

  if v_season_id is null then
    return jsonb_build_object(
      'status', 'skipped_no_season',
      'week_start', v_week_start
    );
  end if;

  v_result := public.award_weekly_consistency_bonuses_for_season(v_season_id, v_week_start)
    || jsonb_build_object('source', 'cron');

  -- Weekly digest: claim once per London week_start so the GMT+BST dual cron cannot double-fire.
  if public.season_push_enabled() then
    v_claimed := public.try_claim_season_push(
      'weekly_update',
      v_season_id,
      v_week_start,
      null,
      null,
      jsonb_build_object('season_id', v_season_id)
    );
    if v_claimed then
      perform public.invoke_push_notification(
        'notify-weekly-update',
        jsonb_build_object(
          'season_id', v_season_id,
          'week_start', v_week_start
        )
      );
      v_result := v_result || jsonb_build_object('weekly_update_push', 'dispatched');
    else
      v_result := v_result || jsonb_build_object('weekly_update_push', 'already_claimed');
    end if;
  else
    v_result := v_result || jsonb_build_object('weekly_update_push', 'disabled');
  end if;

  return v_result;
end;
$$;

grant execute on function public.award_weekly_consistency_bonuses_for_all()
  to anon, authenticated, service_role;

-- =============================================================================
-- 6) Bonus unlocked — awarded path only
-- =============================================================================
create or replace function public.award_weekly_consistency_bonus(
  p_athlete_id uuid,
  p_season_id uuid,
  p_league text,
  p_week_start date
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_week_end date;
  v_count integer;
  v_bonus integer;
  v_rows integer := 0;
  v_claimed boolean;
begin
  if p_league not in ('engine', 'run') then
    raise exception 'award_weekly_consistency_bonus: invalid league %', p_league;
  end if;

  if p_season_id is null then
    raise exception 'award_weekly_consistency_bonus: p_season_id is required';
  end if;

  if exists (
    select 1
    from public.weekly_consistency_bonuses
    where athlete_id = p_athlete_id
      and season_id = p_season_id
      and league = p_league
      and week_start = p_week_start
  ) then
    return jsonb_build_object(
      'status', 'already_awarded',
      'league', p_league,
      'week_start', p_week_start,
      'season_id', p_season_id
    );
  end if;

  v_week_end := p_week_start + 6;

  select count(distinct qualifying_day)
  into v_count
  from (
    select (timezone('Europe/London', started_at))::date as qualifying_day
    from public.workouts
    where athlete_id = p_athlete_id
      and status = 'scored'
      and (
        (p_league = 'engine' and coalesce(engine_score, 0) > 0)
        or (p_league = 'run' and coalesce(run_score, 0) > 0)
      )
      and (timezone('Europe/London', started_at))::date >= p_week_start
      and (timezone('Europe/London', started_at))::date <= v_week_end

    union

    select coalesce(
      (timezone('Europe/London', workout_start_time))::date,
      activity_date
    ) as qualifying_day
    from public.activities
    where athlete_id = p_athlete_id
      and status = 'scored'
      and league_type = p_league
      and public.calculate_activity_score(
            league_type, duration_minutes, avg_hr_percent, avg_pace_seconds
          ) > 0
      and coalesce(
            (timezone('Europe/London', workout_start_time))::date,
            activity_date
          ) >= p_week_start
      and coalesce(
            (timezone('Europe/London', workout_start_time))::date,
            activity_date
          ) <= v_week_end
  ) qualifying_days;

  v_bonus := public.consistency_bonus_points(p_league, v_count);

  if v_bonus = 0 then
    return jsonb_build_object(
      'status', 'no_bonus',
      'league', p_league,
      'qualifying_count', v_count,
      'week_start', p_week_start,
      'season_id', p_season_id
    );
  end if;

  insert into public.weekly_consistency_bonuses
    (athlete_id, season_id, league, week_start, qualifying_count, bonus_points)
  values
    (p_athlete_id, p_season_id, p_league, p_week_start, v_count, v_bonus)
  on conflict (athlete_id, season_id, league, week_start) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object(
      'status', 'already_awarded',
      'league', p_league,
      'week_start', p_week_start,
      'season_id', p_season_id
    );
  end if;

  update public.athletes
  set total_score = coalesce(total_score, 0) + v_bonus
  where id = p_athlete_id;

  insert into public.athlete_stats (athlete_id, season_id, category, score, recorded_at)
  values (p_athlete_id, p_season_id, p_league, v_bonus, now())
  on conflict (athlete_id, season_id, category)
  do update set
    score = athlete_stats.score + excluded.score;

  if public.season_push_enabled() then
    v_claimed := public.try_claim_season_push(
      'bonus_unlocked',
      p_season_id,
      p_week_start,
      p_athlete_id,
      p_league,
      jsonb_build_object('bonus_points', v_bonus)
    );
    if v_claimed then
      perform public.invoke_push_notification(
        'notify-bonus-unlocked',
        jsonb_build_object(
          'athlete_id', p_athlete_id,
          'season_id', p_season_id,
          'league', p_league,
          'bonus_points', v_bonus,
          'week_start', p_week_start
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'status', 'awarded',
    'league', p_league,
    'qualifying_count', v_count,
    'bonus_points', v_bonus,
    'week_start', p_week_start,
    'season_id', p_season_id
  );
end;
$$;

grant execute on function public.award_weekly_consistency_bonus(uuid, uuid, text, date)
  to anon, authenticated, service_role;

-- =============================================================================
-- 7) finalize_season — promo/releg AFTER promotion_history; dry-run positional guard
-- =============================================================================
create or replace function public.finalize_season(
  p_season_id uuid,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to public
as $$
declare
  v_ends_at timestamptz;
  v_week_start date;
  v_bonus_result jsonb;
  v_locked uuid;
  v_next_season_id uuid;
  v_min_workouts integer;
  v_plan_count integer;
  v_promoted integer;
  v_relegated integer;
  v_held integer;
  v_snapshot_count integer := 0;
  v_history_count integer := 0;
  v_membership_count integer := 0;
  v_plan jsonb;
  v_push record;
  v_claimed boolean;
  v_push_dispatched integer := 0;
begin
  if p_season_id is null then
    raise exception 'finalize_season: p_season_id required';
  end if;

  select id, ends_at
  into v_locked, v_ends_at
  from public.seasons
  where id = p_season_id
  for update;

  if v_locked is null then
    raise exception 'finalize_season: season % not found', p_season_id;
  end if;

  if not p_dry_run and exists (
    select 1 from public.promotion_history where season_id = p_season_id limit 1
  ) then
    raise exception 'finalize_season: promotion_history already exists for season %', p_season_id;
  end if;

  v_week_start := public.london_week_start(v_ends_at - interval '1 second');
  v_next_season_id := public.resolve_next_season_id(p_season_id);

  select min_workouts_for_promotion into v_min_workouts
  from public.promotion_settings where id = true;
  v_min_workouts := coalesce(v_min_workouts, 3);

  if p_dry_run then
    v_bonus_result := jsonb_build_object(
      'status', 'skipped_dry_run',
      'week_start', v_week_start,
      'season_id', p_season_id
    );
  else
    v_bonus_result := public.award_weekly_consistency_bonuses_for_season(
      p_season_id, v_week_start
    );
  end if;

  drop table if exists _finalize_plan;
  create temporary table _finalize_plan on commit drop as
  select * from public.compute_season_promotions(p_season_id);

  select jsonb_agg(row_to_json(p) order by p.league, p.from_division, p.final_rank)
  into v_plan
  from _finalize_plan p;

  v_plan := coalesce(v_plan, '[]'::jsonb);

  select
    count(*)::integer,
    count(*) filter (where result = 'promoted')::integer,
    count(*) filter (where result = 'relegated')::integer,
    count(*) filter (where result = 'held')::integer
  into v_plan_count, v_promoted, v_relegated, v_held
  from _finalize_plan;

  -- CRITICAL: no push dispatch may be added above this line.
  -- Dry-run silence is positional — any invoke_push_notification / try_claim_season_push
  -- before this return would fire during admin dry-runs.
  if p_dry_run then
    return jsonb_build_object(
      'status', 'dry_run',
      'season_id', p_season_id,
      'next_season_id', v_next_season_id,
      'final_week_start', v_week_start,
      'min_workouts_for_promotion', v_min_workouts,
      'bonus', v_bonus_result,
      'summary', jsonb_build_object(
        'total', v_plan_count,
        'promoted', v_promoted,
        'relegated', v_relegated,
        'held', v_held
      ),
      'promotions', v_plan,
      'writes', jsonb_build_object(
        'season_snapshots', 0,
        'promotion_history', 0,
        'athlete_divisions_next', 0
      ),
      'pushes', jsonb_build_object(
        'dispatched', 0,
        'season_push_enabled', public.season_push_enabled()
      )
    );
  end if;

  if v_next_season_id is null then
    raise exception
      'finalize_season: no next season after % — create the upcoming season before finalizing',
      p_season_id;
  end if;

  insert into public.season_snapshots (athlete_id, season_id, league, division, rank, points)
  select id, season_id, league, division, rank, season_score
  from public.season_division_leaderboard
  where season_id = p_season_id
  on conflict (athlete_id, season_id, league) do update set
    division = excluded.division,
    rank = excluded.rank,
    points = excluded.points;

  get diagnostics v_snapshot_count = row_count;

  insert into public.promotion_history (
    athlete_id, season_id, league, from_division, to_division,
    result, final_rank, final_points
  )
  select
    athlete_id, p_season_id, league, from_division, to_division,
    result, final_rank, final_points
  from _finalize_plan;

  get diagnostics v_history_count = row_count;

  -- Promotion / relegation pushes AFTER promotion_history. Holds: no push.
  if public.season_push_enabled() then
    for v_push in
      select athlete_id, league, from_division, to_division, result, final_rank
      from _finalize_plan
      where result in ('promoted', 'relegated')
    loop
      v_claimed := public.try_claim_season_push(
        case when v_push.result = 'promoted' then 'promotion' else 'relegation' end,
        p_season_id,
        null,
        v_push.athlete_id,
        v_push.league,
        jsonb_build_object(
          'from_division', v_push.from_division,
          'to_division', v_push.to_division,
          'final_rank', v_push.final_rank
        )
      );
      if v_claimed then
        perform public.invoke_push_notification(
          case
            when v_push.result = 'promoted' then 'notify-promotion'
            else 'notify-relegation'
          end,
          jsonb_build_object(
            'athlete_id', v_push.athlete_id,
            'season_id', p_season_id,
            'league', v_push.league,
            'from_division', v_push.from_division,
            'to_division', v_push.to_division,
            'final_rank', v_push.final_rank
          )
        );
        v_push_dispatched := v_push_dispatched + 1;
      end if;
    end loop;
  end if;

  insert into public.athlete_divisions (athlete_id, season_id, league, division)
  select athlete_id, v_next_season_id, league, to_division
  from _finalize_plan
  on conflict (athlete_id, season_id, league) do update set
    division = excluded.division,
    updated_at = now();

  get diagnostics v_membership_count = row_count;

  perform public.reconcile_athlete_divisions_for_season(v_next_season_id);

  return jsonb_build_object(
    'status', 'finalized',
    'season_id', p_season_id,
    'next_season_id', v_next_season_id,
    'final_week_start', v_week_start,
    'min_workouts_for_promotion', v_min_workouts,
    'bonus', v_bonus_result,
    'summary', jsonb_build_object(
      'total', v_plan_count,
      'promoted', v_promoted,
      'relegated', v_relegated,
      'held', v_held
    ),
    'promotions', v_plan,
    'writes', jsonb_build_object(
      'season_snapshots', v_snapshot_count,
      'promotion_history', v_history_count,
      'athlete_divisions_next', v_membership_count
    ),
    'pushes', jsonb_build_object(
      'dispatched', v_push_dispatched,
      'season_push_enabled', public.season_push_enabled()
    )
  );
end;
$$;
