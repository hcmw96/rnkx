-- Baseline: schema-only dump of live public schema (app-owned).
-- Generated for shadow-DB replay. Excludes auth/storage/realtime schemas,
-- extension-owned objects, and platform helper public.rls_auto_enable.
-- Orphans (direct_messages, message_reactions, sync_diagnostics, waitlist) preserved as live.
-- Activities duplicate protection: three overlapping unique indexes on (athlete_id, workout_start_time)
-- plus UNIQUE (athlete_id, source, source_id) — left as live; not rationalised.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."add_member_to_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_invite_code" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_caller_athlete_id uuid;
  v_creator_id uuid;
  v_is_public boolean;
  v_conv_id uuid;
  v_league_invite_code text;
  v_has_pending_invite boolean;
  v_existing_status text;
  v_club_gender text;
  v_athlete_gender text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select a.id into v_caller_athlete_id
  from public.athletes a
  where a.user_id = auth.uid()
     or a.id = auth.uid()
  order by case when a.user_id = auth.uid() then 0 else 1 end
  limit 1;

  if v_caller_athlete_id is null then
    raise exception 'Forbidden';
  end if;

  select
    pl.created_by,
    coalesce(pl.is_public, false),
    pl.conversation_id,
    pl.invite_code,
    coalesce(pl.gender, 'mixed')
  into v_creator_id, v_is_public, v_conv_id, v_league_invite_code, v_club_gender
  from public.private_leagues pl
  where pl.id = p_league_id;

  if v_creator_id is null then
    raise exception 'Club not found';
  end if;

  select a.gender into v_athlete_gender
  from public.athletes a
  where a.id = p_athlete_id;

  if v_club_gender <> 'mixed' then
    if v_athlete_gender is null or v_athlete_gender <> v_club_gender then
      if v_club_gender = 'male' then
        raise exception 'This club is for men only';
      elsif v_club_gender = 'female' then
        raise exception 'This club is for women only';
      else
        raise exception 'Gender mismatch';
      end if;
    end if;
  end if;

  if v_caller_athlete_id = v_creator_id and p_athlete_id <> v_caller_athlete_id then
    select plm.status
      into v_existing_status
    from public.private_league_members plm
    where plm.league_id = p_league_id
      and plm.athlete_id = p_athlete_id
    limit 1;

    if v_existing_status = 'accepted' then
      raise exception 'Already a member';
    end if;

    if v_existing_status = 'pending' then
      raise exception 'Already invited';
    end if;

    insert into public.private_league_members (league_id, athlete_id, status, invited_by)
    values (p_league_id, p_athlete_id, 'pending', v_caller_athlete_id);
    return;
  end if;

  if p_athlete_id <> v_caller_athlete_id then
    raise exception 'Forbidden';
  end if;

  select exists (
    select 1
    from public.private_league_members plm
    where plm.league_id = p_league_id
      and plm.athlete_id = p_athlete_id
      and plm.status = 'pending'
  ) into v_has_pending_invite;

  if not (
    v_is_public
    or v_has_pending_invite
    or (p_invite_code is not null and p_invite_code = v_league_invite_code)
  ) then
    raise exception 'Forbidden';
  end if;

  insert into public.private_league_members (league_id, athlete_id, status)
  values (p_league_id, p_athlete_id, 'accepted')
  on conflict (league_id, athlete_id) do update
    set status = 'accepted';

  if v_conv_id is not null then
    insert into public.conversation_members (conversation_id, athlete_id)
    values (v_conv_id, p_athlete_id)
    on conflict do nothing;
  end if;
end;
$$;


ALTER FUNCTION "public"."add_member_to_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_invite_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_assert_caller"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if coalesce(public.admin_is_caller_allowed(), false) then
    return;
  end if;
  raise exception 'Forbidden' using errcode = '42501';
end;
$$;


ALTER FUNCTION "public"."admin_assert_caller"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_athlete_wearable_summary"("p_athlete_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.admin_assert_caller();

  return (
    select coalesce(
      jsonb_object_agg(
        sub.athlete_id::text,
        jsonb_build_object(
          'terra_providers', sub.terra_providers,
          'has_whoop', sub.has_whoop
        )
      ),
      '{}'::jsonb
    )
    from (
      select
        a.id as athlete_id,
        coalesce(
          array_agg(distinct tc.provider::text) filter (where tc.provider is not null),
          '{}'::text[]
        ) as terra_providers,
        exists (
          select 1
          from public.whoop_connections w
          where w.athlete_id = a.id
        ) as has_whoop
      from unnest(p_athlete_ids) as u(athlete_id)
      join public.athletes a on a.id = u.athlete_id
      left join public.terra_connections tc on tc.athlete_id = a.id
      group by a.id
    ) sub
  );
end;
$$;


ALTER FUNCTION "public"."admin_athlete_wearable_summary"("p_athlete_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_athlete_season_scores"("p_athlete_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_season_id uuid;
  v_total numeric;
  v_engine numeric := 0;
  v_run numeric := 0;
  v_engine_consistency numeric := 0;
  v_run_consistency numeric := 0;
begin
  perform public.admin_assert_caller();

  select id into v_season_id
  from public.seasons
  where is_active = true
  order by starts_at desc
  limit 1;

  select coalesce(total_score, 0)
  into v_total
  from public.athletes
  where id = p_athlete_id;

  if v_season_id is not null then
    select coalesce(max(score) filter (where category = 'engine'), 0),
           coalesce(max(score) filter (where category = 'run'), 0)
    into v_engine, v_run
    from public.athlete_stats
    where athlete_id = p_athlete_id
      and season_id = v_season_id
      and category in ('engine', 'run');

    select coalesce(sum(bonus_points) filter (where league = 'engine'), 0),
           coalesce(sum(bonus_points) filter (where league = 'run'), 0)
    into v_engine_consistency, v_run_consistency
    from public.weekly_consistency_bonuses
    where athlete_id = p_athlete_id
      and season_id = v_season_id;
  end if;

  return jsonb_build_object(
    'season_id', v_season_id,
    'total_score', coalesce(v_total, 0),
    'engine_score', coalesce(v_engine, 0),
    'run_score', coalesce(v_run, 0),
    'engine_consistency_bonus', coalesce(v_engine_consistency, 0),
    'run_consistency_bonus', coalesce(v_run_consistency, 0),
    -- Deprecated alias: total consistency across leagues (not additive on top of engine/run)
    'consistency_bonus',
      coalesce(v_engine_consistency, 0) + coalesce(v_run_consistency, 0)
  );
end;
$$;


ALTER FUNCTION "public"."admin_get_athlete_season_scores"("p_athlete_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_dashboard"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_get_dashboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_is_caller_allowed"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    coalesce(
      (
        select lower(trim(u.email)) = any (
          array[
            'shaun@hsmithplc.com',
            'shaunsmith1031@icloud.com',
            'shaunsmith1031@gmail.com'
          ]::text[]
        )
        from auth.users u
        where u.id = auth.uid()
      ),
      false
    )
    or exists (
      select 1
      from public.athletes a
      where (a.id = auth.uid() or a.user_id = auth.uid())
        and lower(trim(coalesce(a.username, ''))) = any (
          array['sds8', 'shaunsmith', 'henry', 'henryw']::text[]
        )
    );
$$;


ALTER FUNCTION "public"."admin_is_caller_allowed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_athlete_recent_activity"("p_athlete_id" "uuid", "p_limit" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  perform public.admin_assert_caller();

  return jsonb_build_object(
    'workouts',
    coalesce(
      (
        select jsonb_agg(row_to_json(w) order by w.started_at desc)
        from (
          select
            id,
            started_at,
            activity_type,
            duration_min,
            avg_hr,
            avg_pace_per_km,
            engine_score,
            run_score,
            status,
            reject_reason
          from public.workouts
          where athlete_id = p_athlete_id
          order by started_at desc
          limit v_limit
        ) w
      ),
      '[]'::jsonb
    ),
    'activities',
    coalesce(
      (
        select jsonb_agg(row_to_json(a) order by a.activity_date desc)
        from (
          select
            id,
            activity_date,
            activity_type,
            duration_minutes,
            avg_hr_percent,
            avg_pace_seconds,
            league_type,
            status,
            public.calculate_activity_score(
              league_type,
              duration_minutes,
              avg_hr_percent,
              avg_pace_seconds
            ) as computed_score
          from public.activities
          where athlete_id = p_athlete_id
          order by workout_start_time desc nulls last, activity_date desc
          limit v_limit
        ) a
      ),
      '[]'::jsonb
    )
  );
end;
$$;


ALTER FUNCTION "public"."admin_list_athlete_recent_activity"("p_athlete_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_recent_rejected_activity"("p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  perform public.admin_assert_caller();

  return coalesce(
    (
      select jsonb_agg(row_to_json(u) order by u.occurred_at desc)
      from (
        select *
        from (
          select
            'workout'::text as row_kind,
            w.id,
            w.athlete_id,
            coalesce(ath.username, ath.display_name, left(w.athlete_id::text, 8)) as athlete_label,
            w.started_at as occurred_at,
            w.activity_type,
            w.duration_min as duration_minutes,
            w.avg_hr,
            null::numeric as avg_hr_percent,
            w.avg_pace_per_km as pace_seconds,
            w.engine_score,
            w.run_score,
            null::text as league_type,
            null::numeric as computed_score,
            w.status,
            w.reject_reason
          from public.workouts w
          join public.athletes ath on ath.id = w.athlete_id
          where lower(coalesce(w.status, '')) = 'rejected'
             or (
               coalesce(w.engine_score, 0) + coalesce(w.run_score, 0) = 0
               and lower(coalesce(w.status, '')) <> 'pending'
             )

          union all

          select
            'activity'::text as row_kind,
            a.id,
            a.athlete_id,
            coalesce(ath.username, ath.display_name, left(a.athlete_id::text, 8)) as athlete_label,
            coalesce(a.workout_start_time, a.activity_date::timestamptz) as occurred_at,
            a.activity_type,
            a.duration_minutes,
            null::numeric as avg_hr,
            a.avg_hr_percent,
            a.avg_pace_seconds as pace_seconds,
            null::numeric as engine_score,
            null::numeric as run_score,
            a.league_type,
            public.calculate_activity_score(
              a.league_type,
              a.duration_minutes,
              a.avg_hr_percent,
              a.avg_pace_seconds
            ) as computed_score,
            a.status,
            null::text as reject_reason
          from public.activities a
          join public.athletes ath on ath.id = a.athlete_id
          where lower(coalesce(a.status, '')) = 'rejected'
             or public.calculate_activity_score(
                  a.league_type,
                  a.duration_minutes,
                  a.avg_hr_percent,
                  a.avg_pace_seconds
                ) = 0
        ) combined
        order by occurred_at desc
        limit v_limit
      ) u
    ),
    '[]'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."admin_list_recent_rejected_activity"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."athlete_season_league_workout_count"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league" "text") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select starts_at, ends_at
    from public.seasons
    where id = p_season_id
  ),
  sessions as (
    select w.id
    from public.workouts w, bounds b
    where w.athlete_id = p_athlete_id
      and w.status = 'scored'
      and w.started_at >= b.starts_at
      and w.started_at < b.ends_at
      and (
        (p_league = 'engine' and coalesce(w.engine_score, 0) > 0)
        or (p_league = 'run' and coalesce(w.run_score, 0) > 0)
      )

    union

    select a.id
    from public.activities a, bounds b
    where a.athlete_id = p_athlete_id
      and a.status = 'scored'
      and a.league_type = p_league
      and coalesce(a.workout_start_time, a.activity_date::timestamptz) >= b.starts_at
      and coalesce(a.workout_start_time, a.activity_date::timestamptz) < b.ends_at
      and public.calculate_activity_score(
            a.league_type, a.duration_minutes, a.avg_hr_percent, a.avg_pace_seconds
          ) > 0
  )
  select count(*)::integer from sessions;
$$;


ALTER FUNCTION "public"."athlete_season_league_workout_count"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."athletes_ensure_open_divisions_trg"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.ensure_athlete_open_divisions(new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."athletes_ensure_open_divisions_trg"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_weekly_consistency_bonus"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league" "text", "p_week_start" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_week_end date;
  v_count integer;
  v_bonus integer;
  v_rows integer := 0;
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

  -- Qualifying = distinct London calendar days with >0 score in that league.
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

  -- Lifetime aggregate
  update public.athletes
  set total_score = coalesce(total_score, 0) + v_bonus
  where id = p_athlete_id;

  -- Division board: bonus lands on the league row.
  -- recorded_at: INSERT only (qualifying workouts guarantee the row exists;
  -- if somehow missing, INSERT stamps recorded_at; UPDATE leaves it alone).
  insert into public.athlete_stats (athlete_id, season_id, category, score, recorded_at)
  values (p_athlete_id, p_season_id, p_league, v_bonus, now())
  on conflict (athlete_id, season_id, category)
  do update set
    score = athlete_stats.score + excluded.score;
    -- recorded_at intentionally NOT updated

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


ALTER FUNCTION "public"."award_weekly_consistency_bonus"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league" "text", "p_week_start" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_weekly_consistency_bonuses_for_all"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_week_start date;
  v_season_id uuid;
begin
  -- Cron fires Monday 01:00 Europe/London → award the just-completed London week.
  v_week_start := public.london_week_start(now()) - 7;
  v_season_id := public.season_id_for_london_week(v_week_start);

  if v_season_id is null then
    return jsonb_build_object(
      'status', 'skipped_no_season',
      'week_start', v_week_start
    );
  end if;

  return public.award_weekly_consistency_bonuses_for_season(v_season_id, v_week_start)
    || jsonb_build_object('source', 'cron');
end;
$$;


ALTER FUNCTION "public"."award_weekly_consistency_bonuses_for_all"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_weekly_consistency_bonuses_for_season"("p_season_id" "uuid", "p_week_start" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_rec record;
  v_league text;
  v_result jsonb;
  v_total integer := 0;
  v_awarded integer := 0;
  v_already integer := 0;
  v_none integer := 0;
begin
  if p_season_id is null then
    raise exception 'award_weekly_consistency_bonuses_for_season: p_season_id required';
  end if;

  for v_rec in select id from public.athletes
  loop
    foreach v_league in array array['engine', 'run']
    loop
      v_total := v_total + 1;
      begin
        v_result := public.award_weekly_consistency_bonus(
          v_rec.id, p_season_id, v_league, p_week_start
        );
        case v_result->>'status'
          when 'awarded' then v_awarded := v_awarded + 1;
          when 'already_awarded' then v_already := v_already + 1;
          else v_none := v_none + 1;
        end case;
      exception when others then
        raise warning 'award_weekly_consistency_bonus failed athlete=% league=%: %',
          v_rec.id, v_league, sqlerrm;
      end;
    end loop;
  end loop;

  return jsonb_build_object(
    'season_id', p_season_id,
    'week_start', p_week_start,
    'attempts', v_total,
    'awarded', v_awarded,
    'already_awarded', v_already,
    'no_bonus', v_none
  );
end;
$$;


ALTER FUNCTION "public"."award_weekly_consistency_bonuses_for_season"("p_season_id" "uuid", "p_week_start" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_activity_score"("p_league_type" "text", "p_duration_minutes" numeric, "p_avg_hr_percent" numeric, "p_avg_pace_seconds" numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_dur numeric;
begin
  if p_duration_minutes is null or p_duration_minutes < 15 then
    return 0;
  end if;
  v_dur := least(p_duration_minutes, 120);

  if p_league_type = 'run' then
    if p_avg_pace_seconds is null then return 0; end if;
    return v_dur * case
      when p_avg_pace_seconds < 209 then 5.6
      when p_avg_pace_seconds < 240 then 5.2
      when p_avg_pace_seconds < 270 then 4.7
      when p_avg_pace_seconds < 300 then 4.1
      when p_avg_pace_seconds < 330 then 3.5
      when p_avg_pace_seconds < 360 then 3.0
      when p_avg_pace_seconds < 390 then 2.6
      when p_avg_pace_seconds < 420 then 2.2
      when p_avg_pace_seconds < 450 then 1.7
      when p_avg_pace_seconds < 480 then 1.2
      when p_avg_pace_seconds < 540 then 0.7
      else 0
    end;
  elsif p_league_type = 'engine' then
    return v_dur * public.engine_points_per_minute(p_avg_hr_percent);
  end if;

  return 0;
end;
$$;


ALTER FUNCTION "public"."calculate_activity_score"("p_league_type" "text", "p_duration_minutes" numeric, "p_avg_hr_percent" numeric, "p_avg_pace_seconds" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."caller_is_private_league_member"("p_league_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  is_member boolean;
begin
  perform set_config('row_security', 'off', true);

  select exists (
    select 1
    from public.private_league_members plm
    where plm.league_id = p_league_id
      and plm.athlete_id in (select public.current_athlete_ids())
  )
  into is_member;

  return coalesce(is_member, false);
end;
$$;


ALTER FUNCTION "public"."caller_is_private_league_member"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."caller_private_league_ids"() RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform set_config('row_security', 'off', true);

  return query
    select distinct plm.league_id
    from public.private_league_members plm
    where plm.athlete_id in (select public.current_athlete_ids());
end;
$$;


ALTER FUNCTION "public"."caller_private_league_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."category_leaderboard_rank"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_category" "text") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select r::integer
      from (
        select
          ad.athlete_id,
          row_number() over (
            partition by ad.division
            order by
              coalesce(ast.score, 0) desc,
              ast.recorded_at asc nulls last,
              ad.athlete_id asc
          ) as r
        from public.athlete_divisions ad
        left join public.athlete_stats ast
          on ast.athlete_id = ad.athlete_id
         and ast.season_id = ad.season_id
         and ast.category = ad.league
        where ad.season_id = p_season_id
          and ad.league = p_category
      ) ranked
      where athlete_id = p_athlete_id
    ),
    999999
  );
$$;


ALTER FUNCTION "public"."category_leaderboard_rank"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_season_promotions"("p_season_id" "uuid") RETURNS TABLE("athlete_id" "uuid", "display_name" "text", "league" "text", "from_division" "text", "to_division" "text", "result" "text", "final_rank" integer, "final_points" numeric, "workout_count" integer, "eligible" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_min_workouts integer;
  v_league text;
  v_division text;
  v_rule record;
  v_n integer;
  v_promote_slots integer;
  v_relegate_slots integer;
  v_pct_slots integer;
begin
  if p_season_id is null then
    raise exception 'compute_season_promotions: p_season_id required';
  end if;

  select min_workouts_for_promotion
  into v_min_workouts
  from public.promotion_settings
  where id = true;

  v_min_workouts := coalesce(v_min_workouts, 3);

  drop table if exists _promo_board;
  create temporary table _promo_board (
    athlete_id uuid not null,
    display_name text,
    league text not null,
    division text not null,
    rank integer not null,
    points numeric not null,
    workout_count integer not null,
    eligible boolean not null,
    result text,
    to_division text,
    primary key (athlete_id, league)
  ) on commit drop;

  insert into _promo_board (
    athlete_id, display_name, league, division, rank, points, workout_count, eligible
  )
  select
    lb.id,
    lb.display_name,
    lb.league,
    lb.division,
    lb.rank,
    lb.season_score,
    public.athlete_season_league_workout_count(lb.id, p_season_id, lb.league),
    public.athlete_season_league_workout_count(lb.id, p_season_id, lb.league) >= v_min_workouts
  from public.season_division_leaderboard lb
  where lb.season_id = p_season_id;

  -- Default: hold in place
  update _promo_board
  set result = 'held', to_division = division;

  foreach v_league in array array['engine', 'run']
  loop
    for v_division in
      select distinct b.division from _promo_board b where b.league = v_league
    loop
      select * into v_rule
      from public.division_rules
      where division = v_division;

      if v_rule.division is null then
        raise exception 'compute_season_promotions: missing division_rules for %', v_division;
      end if;

      select count(*) into v_n
      from _promo_board b
      where b.league = v_league and b.division = v_division;

      -- Promote slots from rules at execution time (never hardcoded).
      v_promote_slots := 0;
      if v_rule.promote_percent is not null and v_rule.promotes_to is not null then
        v_pct_slots := ceil(v_n * v_rule.promote_percent / 100.0)::integer;
        v_promote_slots := v_pct_slots;
        if v_rule.promote_min_count is not null then
          v_promote_slots := greatest(v_promote_slots, v_rule.promote_min_count);
        end if;
        v_promote_slots := least(v_promote_slots, v_n);
      end if;

      v_relegate_slots := 0;
      if v_rule.relegate_percent is not null and v_rule.relegates_to is not null then
        v_relegate_slots := least(
          ceil(v_n * v_rule.relegate_percent / 100.0)::integer,
          v_n
        );
      end if;

      -- Promote: eligible only, best ranks first, until slots filled.
      if v_promote_slots > 0 then
        update _promo_board b
        set result = 'promoted', to_division = v_rule.promotes_to
        where (b.athlete_id, b.league) in (
          select x.athlete_id, x.league
          from _promo_board x
          where x.league = v_league
            and x.division = v_division
            and x.eligible
          order by x.rank asc
          limit v_promote_slots
        );
      end if;

      -- Relegate: eligible not already promoted, worst ranks first.
      if v_relegate_slots > 0 then
        update _promo_board b
        set result = 'relegated', to_division = v_rule.relegates_to
        where (b.athlete_id, b.league) in (
          select x.athlete_id, x.league
          from _promo_board x
          where x.league = v_league
            and x.division = v_division
            and x.eligible
            and x.result = 'held'
          order by x.rank desc
          limit v_relegate_slots
        );
      end if;
    end loop;
  end loop;

  return query
  select
    b.athlete_id,
    b.display_name,
    b.league,
    b.division,
    b.to_division,
    b.result,
    b.rank,
    b.points,
    b.workout_count,
    b.eligible
  from _promo_board b
  order by b.league, b.division, b.rank;
end;
$$;


ALTER FUNCTION "public"."compute_season_promotions"("p_season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consistency_bonus_points"("p_league" "text", "p_qualifying_count" integer) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select max(t.bonus_points)
      from public.consistency_bonus_tiers t
      where t.league = p_league
        and t.min_workouts <= p_qualifying_count
    ),
    0
  );
$$;


ALTER FUNCTION "public"."consistency_bonus_points"("p_league" "text", "p_qualifying_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean DEFAULT false, "p_image_url" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_name text;
  v_conversation_id uuid;
  v_league_id uuid;
  v_invite_code text;
  v_attempt int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_athlete_user_id(p_athlete_id);

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  v_name := nullif(trim(p_name), '');
  if v_name is null then
    raise exception 'Club name is required';
  end if;

  if p_league_type not in ('engine', 'run') then
    raise exception 'Invalid league type';
  end if;

  insert into public.conversations (is_group, name, created_by)
  values (true, v_name, p_athlete_id)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, athlete_id)
  values (v_conversation_id, p_athlete_id);

  for v_attempt in 1..8 loop
    v_invite_code := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8);
    begin
      insert into public.private_leagues (
        name,
        created_by,
        league_type,
        conversation_id,
        image_url,
        invite_code,
        is_public
      )
      values (
        v_name,
        p_athlete_id,
        p_league_type,
        v_conversation_id,
        p_image_url,
        v_invite_code,
        coalesce(p_is_public, false)
      )
      returning id into v_league_id;
      exit;
    exception
      when unique_violation then
        if v_attempt = 8 then
          raise;
        end if;
    end;
  end loop;

  insert into public.private_league_members (league_id, athlete_id, status)
  values (v_league_id, p_athlete_id, 'accepted');

  return v_league_id;
end;
$$;


ALTER FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean, "p_image_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean DEFAULT false, "p_image_url" "text" DEFAULT NULL::"text", "p_gender" "text" DEFAULT 'mixed'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_name text;
  v_conversation_id uuid;
  v_league_id uuid;
  v_invite_code text;
  v_attempt int;
  v_gender text;
  v_athlete_gender text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_athlete_user_id(p_athlete_id);

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  v_name := nullif(trim(p_name), '');
  if v_name is null then
    raise exception 'Club name is required';
  end if;

  if p_league_type not in ('engine', 'run') then
    raise exception 'Invalid league type';
  end if;

  v_gender := coalesce(nullif(trim(p_gender), ''), 'mixed');
  if v_gender not in ('male', 'female', 'mixed') then
    raise exception 'Invalid club gender';
  end if;

  select a.gender into v_athlete_gender
  from public.athletes a
  where a.id = p_athlete_id;

  if v_gender <> 'mixed' then
    if v_athlete_gender is null or v_athlete_gender <> v_gender then
      if v_gender = 'male' then
        raise exception 'You can only create a men''s club if your profile gender is male';
      elsif v_gender = 'female' then
        raise exception 'You can only create a women''s club if your profile gender is female';
      else
        raise exception 'Gender mismatch';
      end if;
    end if;
  end if;

  insert into public.conversations (is_group, name, created_by)
  values (true, v_name, p_athlete_id)
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, athlete_id)
  values (v_conversation_id, p_athlete_id);

  for v_attempt in 1..8 loop
    v_invite_code := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8);
    begin
      insert into public.private_leagues (
        name,
        created_by,
        league_type,
        conversation_id,
        image_url,
        invite_code,
        is_public,
        gender
      )
      values (
        v_name,
        p_athlete_id,
        p_league_type,
        v_conversation_id,
        p_image_url,
        v_invite_code,
        coalesce(p_is_public, false),
        v_gender
      )
      returning id into v_league_id;
      exit;
    exception
      when unique_violation then
        if v_attempt = 8 then
          raise;
        end if;
    end;
  end loop;

  insert into public.private_league_members (league_id, athlete_id, status)
  values (v_league_id, p_athlete_id, 'accepted');

  return v_league_id;
end;
$$;


ALTER FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean, "p_image_url" "text", "p_gender" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_athlete_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select a.id
  from public.athletes a
  where a.user_id = auth.uid() or a.id = auth.uid();
$$;


ALTER FUNCTION "public"."current_athlete_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_private_league"("p_league_id" "uuid", "p_athlete_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Only the creator can delete
  if not exists (
    select 1 from private_leagues 
    where id = p_league_id and created_by = p_athlete_id
  ) then
    raise exception 'Not authorized';
  end if;

  -- Delete all members
  delete from private_league_members where league_id = p_league_id;
  
  -- Delete conversation members and messages
  delete from conversation_members 
  where conversation_id = (
    select conversation_id from private_leagues where id = p_league_id
  );
  
  delete from conversation_messages
  where conversation_id = (
    select conversation_id from private_leagues where id = p_league_id
  );

  -- Delete the conversation
  delete from conversations 
  where id = (
    select conversation_id from private_leagues where id = p_league_id
  );

  -- Delete the league
  delete from private_leagues where id = p_league_id;
end;
$$;


ALTER FUNCTION "public"."delete_private_league"("p_league_id" "uuid", "p_athlete_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_league_session_score"("p_hr_percent" numeric, "p_duration_minutes" numeric) RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_ppm numeric;
  v_duration numeric;
begin
  if not public.session_duration_qualifies_for_scoring(p_duration_minutes) then
    return 0;
  end if;

  v_duration := least(coalesce(p_duration_minutes, 0), 120);
  v_ppm := public.engine_ppm_from_hr_percent(p_hr_percent);
  if v_ppm <= 0 then
    return 0;
  end if;

  return round(v_ppm * v_duration, 1);
end;
$$;


ALTER FUNCTION "public"."engine_league_session_score"("p_hr_percent" numeric, "p_duration_minutes" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_points_per_minute"("p_hr_pct" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  with knots(pct, ppm) as (
    values
      (58,0.50),(59,0.50),(60,0.50),(61,0.61),(62,0.72),(63,0.83),(64,0.94),
      (65,1.05),(66,1.21),(67,1.37),(68,1.53),(69,1.69),(70,1.85),(71,2.05),
      (72,2.25),(73,2.43),(74,2.62),(75,2.80),(76,2.98),(77,3.16),(78,3.34),
      (79,3.52),(80,3.70),(81,3.80),(82,3.90),(83,4.00),(84,4.10),(85,4.20),
      (86,4.40),(87,4.60),(88,4.80),(89,5.00),(90,5.20)
  )
  select case
    when p_hr_pct is null then 0
    when p_hr_pct < 58 then 0
    when p_hr_pct >= 90 then 5.20
    else (
      select lo.ppm + (hi.ppm - lo.ppm) * (p_hr_pct - lo.pct) / (hi.pct - lo.pct)
      from knots lo
      join knots hi on hi.pct = lo.pct + 1
      where p_hr_pct >= lo.pct and p_hr_pct < hi.pct
    )
  end;
$$;


ALTER FUNCTION "public"."engine_points_per_minute"("p_hr_pct" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."engine_ppm_from_hr_percent"("p_hr_percent" numeric) RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_tenths integer;
  v_ppm numeric;
begin
  if p_hr_percent is null or p_hr_percent < 58 then
    return 0;
  end if;

  if p_hr_percent > 100 then
    return 5.20;
  end if;

  v_tenths := round(p_hr_percent * 10)::integer;
  select ppm into v_ppm from public.engine_ppm_lookup where hr_percent_tenths = v_tenths;
  return coalesce(v_ppm, 0);
end;
$$;


ALTER FUNCTION "public"."engine_ppm_from_hr_percent"("p_hr_percent" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_athlete_open_divisions"("p_athlete_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_season_id uuid;
begin
  v_season_id := public.resolve_membership_season_id();
  if v_season_id is null then
    return;
  end if;

  insert into public.athlete_divisions (athlete_id, season_id, league, division)
  values
    (p_athlete_id, v_season_id, 'engine', 'Open'),
    (p_athlete_id, v_season_id, 'run', 'Open')
  on conflict (athlete_id, season_id, league) do nothing;
end;
$$;


ALTER FUNCTION "public"."ensure_athlete_open_divisions"("p_athlete_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_athlete_user_id"("p_athlete_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.athletes
  set user_id = auth.uid()
  where id = p_athlete_id
    and user_id is distinct from auth.uid()
    and (id = auth.uid() or user_id = auth.uid());
end;
$$;


ALTER FUNCTION "public"."ensure_athlete_user_id"("p_athlete_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_season"("p_season_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.finalize_season(p_season_id, false);
$$;


ALTER FUNCTION "public"."finalize_season"("p_season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_season"("p_season_id" "uuid", "p_dry_run" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- STEP 1: final-week consistency bonus (skipped on dry-run — no writes)
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

  -- STEP 2: compute promotions from current division board ranks (once)
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
      )
    );
  end if;

  if v_next_season_id is null then
    raise exception
      'finalize_season: no next season after % — create the upcoming season before finalizing',
      p_season_id;
  end if;

  -- STEP 3: snapshot pre-promo standings
  insert into public.season_snapshots (athlete_id, season_id, league, division, rank, points)
  select id, season_id, league, division, rank, season_score
  from public.season_division_leaderboard
  where season_id = p_season_id
  on conflict (athlete_id, season_id, league) do update set
    division = excluded.division,
    rank = excluded.rank,
    points = excluded.points;

  get diagnostics v_snapshot_count = row_count;

  -- STEP 4: promotion_history for every athlete (including holds)
  insert into public.promotion_history (
    athlete_id, season_id, league, from_division, to_division,
    result, final_rank, final_points
  )
  select
    athlete_id, p_season_id, league, from_division, to_division,
    result, final_rank, final_points
  from _finalize_plan;

  get diagnostics v_history_count = row_count;

  -- STEP 5: next-season membership only (do not mutate ending season rows)
  insert into public.athlete_divisions (athlete_id, season_id, league, division)
  select athlete_id, v_next_season_id, league, to_division
  from _finalize_plan
  on conflict (athlete_id, season_id, league) do update set
    division = excluded.division,
    updated_at = now();

  get diagnostics v_membership_count = row_count;

  -- Ensure any athlete missing from the board still gets Open on next season
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
    )
  );
end;
$$;


ALTER FUNCTION "public"."finalize_season"("p_season_id" "uuid", "p_dry_run" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fire_scoring_push_notifications"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league_type" "text", "p_score" numeric, "p_old_rank" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_new_rank integer;
begin
  if p_athlete_id is null or p_season_id is null or p_score is null or p_score <= 0 then
    return;
  end if;

  v_new_rank := public.category_leaderboard_rank(p_athlete_id, p_season_id, p_league_type);

  perform public.invoke_push_notification(
    'notify-workout-scored',
    jsonb_build_object(
      'athlete_id', p_athlete_id::text,
      'score', round(p_score::numeric, 1),
      'league_type', p_league_type,
      'rank', v_new_rank
    )
  );

  if p_old_rank is not null and v_new_rank < p_old_rank then
    perform public.invoke_push_notification(
      'notify-rank-change',
      jsonb_build_object(
        'athlete_id', p_athlete_id::text,
        'old_rank', p_old_rank,
        'new_rank', v_new_rank,
        'league_type', p_league_type
      )
    );
  end if;
end;
$$;


ALTER FUNCTION "public"."fire_scoring_push_notifications"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league_type" "text", "p_score" numeric, "p_old_rank" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_club_by_conversation"("p_conversation_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "image_url" "text", "league_type" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select pl.id, pl.name, pl.image_url, pl.league_type
  from public.private_leagues pl
  where pl.conversation_id = p_conversation_id
    and public.user_is_conversation_member(p_conversation_id)
  limit 1;
$$;


ALTER FUNCTION "public"."get_club_by_conversation"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_dm_conversation"("p_my_athlete_id" "uuid", "p_friend_athlete_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_cid uuid;
  v_label text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.athletes a
    where a.id = p_my_athlete_id and a.user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
  end if;

  if p_my_athlete_id = p_friend_athlete_id then
    raise exception 'Cannot message yourself';
  end if;

  select c.id into v_cid
  from public.conversations c
  where c.is_group = false
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.athlete_id = p_my_athlete_id
    )
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.athlete_id = p_friend_athlete_id
    )
    and (select count(*)::int from public.conversation_members m where m.conversation_id = c.id) = 2
  limit 1;

  if v_cid is not null then
    return v_cid;
  end if;

  select coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), 'Chat')
  into v_label
  from public.athletes
  where id = p_friend_athlete_id;

  insert into public.conversations (is_group, name, created_by)
  values (false, v_label, p_my_athlete_id)
  returning id into v_cid;

  insert into public.conversation_members (conversation_id, athlete_id)
  values (v_cid, p_my_athlete_id), (v_cid, p_friend_athlete_id);

  return v_cid;
end;
$$;


ALTER FUNCTION "public"."get_or_create_dm_conversation"("p_my_athlete_id" "uuid", "p_friend_athlete_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_private_league"("p_league_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "image_url" "text", "league_type" "text", "created_by" "uuid", "conversation_id" "uuid", "invite_code" "text", "is_public" boolean, "gender" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    pl.id,
    pl.name,
    pl.image_url,
    pl.league_type,
    pl.created_by,
    pl.conversation_id,
    pl.invite_code,
    pl.is_public,
    coalesce(pl.gender, 'mixed')
  from public.private_leagues pl
  where pl.id = p_league_id
    and (
      pl.created_by in (select public.current_athlete_ids())
      or pl.id in (select public.caller_private_league_ids())
      or coalesce(pl.is_public, false) = true
    )
  limit 1;
$$;


ALTER FUNCTION "public"."get_private_league"("p_league_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_private_league_for_join"("p_invite_code" "text") RETURNS TABLE("id" "uuid", "name" "text", "member_count" bigint, "conversation_id" "uuid", "gender" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    pl.id,
    pl.name,
    coalesce(
      (
        select count(*)::bigint
        from public.private_league_members m
        where m.league_id = pl.id and m.status = 'accepted'
      ),
      0
    ) as member_count,
    pl.conversation_id,
    coalesce(pl.gender, 'mixed')
  from public.private_leagues pl
  where pl.invite_code is not null
    and pl.invite_code = p_invite_code
  limit 1;
$$;


ALTER FUNCTION "public"."get_private_league_for_join"("p_invite_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoke_push_notification"("p_edge_function" "text", "p_body" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_base text;
  v_key text;
  v_name text;
begin
  v_base := null;
  foreach v_name in array array['supabase_url', 'SUPABASE_URL', 'project_url'] loop
  begin
    select decrypted_secret into v_base
    from vault.decrypted_secrets
    where name = v_name
    limit 1;
  exception
    when others then
      null;
  end;
    exit when v_base is not null and v_base <> '';
  end loop;

  if v_base is null or v_base = '' then
    v_base := 'https://vuhnmlixouvghvyjwrdv.supabase.co';
  end if;

  v_key := null;
  foreach v_name in array array['service_role_key', 'supabase_service_role_key', 'SUPABASE_SERVICE_ROLE_KEY'] loop
  begin
    select decrypted_secret into v_key
    from vault.decrypted_secrets
    where name = v_name
    limit 1;
  exception
    when others then
      null;
  end;
    exit when v_key is not null and v_key <> '';
  end loop;

  if v_key is null or v_key = '' then
    raise warning 'invoke_push_notification: no vault service role secret (tried service_role_key, supabase_service_role_key, SUPABASE_SERVICE_ROLE_KEY) — skipping %', p_edge_function;
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_base, '/') || '/functions/v1/' || p_edge_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := p_body
  );
exception
  when others then
    raise warning 'invoke_push_notification(%) failed: %', p_edge_function, sqlerrm;
end;
$$;


ALTER FUNCTION "public"."invoke_push_notification"("p_edge_function" "text", "p_body" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoke_whoop_token_refresh"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_base text;
  v_key text;
begin
  begin
    select decrypted_secret into v_base
    from vault.decrypted_secrets
    where name = 'supabase_url'
    limit 1;
  exception
    when others then
      v_base := null;
  end;

  if v_base is null or v_base = '' then
    v_base := 'https://vuhnmlixouvghvyjwrdv.supabase.co';
  end if;

  begin
    select decrypted_secret into v_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;
  exception
    when others then
      v_key := null;
  end;

  if v_key is null or v_key = '' then
    raise warning 'invoke_whoop_token_refresh: vault secret service_role_key not set — skipping';
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_base, '/') || '/functions/v1/whoop-token-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  );
exception
  when others then
    raise warning 'invoke_whoop_token_refresh failed: %', sqlerrm;
end;
$$;


ALTER FUNCTION "public"."invoke_whoop_token_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_allowlisted_athlete_for_caller"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_target_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if coalesce(public.admin_is_caller_allowed(), false) then
    return true;
  end if;

  select a.id
  into v_target_id
  from public.athletes a
  where a.user_id is null
    and lower(trim(coalesce(a.username, ''))) = any (
      array['sds8', 'shaunsmith', 'henry', 'henryw']::text[]
    )
  order by a.id
  limit 1;

  if v_target_id is null then
    return false;
  end if;

  update public.athletes
  set user_id = auth.uid()
  where id = v_target_id
    and user_id is null;

  return found;
end;
$$;


ALTER FUNCTION "public"."link_allowlisted_athlete_for_caller"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_conversation_members"("p_conversation_id" "uuid") RETURNS TABLE("athlete_id" "uuid", "username" "text", "display_name" "text", "avatar_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select a.id, a.username, a.display_name, a.avatar_url
  from public.conversation_members cm
  join public.athletes a on a.id = cm.athlete_id
  where cm.conversation_id = p_conversation_id
    and public.user_is_conversation_member(p_conversation_id)
  order by coalesce(nullif(trim(a.display_name), ''), nullif(trim(a.username), ''), a.id::text);
$$;


ALTER FUNCTION "public"."list_conversation_members"("p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer DEFAULT 200) RETURNS TABLE("id" "uuid", "athlete_id" "uuid", "content" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select m.id, m.athlete_id, m.content, m.created_at
  from public.conversation_messages m
  where m.conversation_id = p_conversation_id
    and exists (
      select 1
      from public.conversation_members cm
      join public.athletes a on a.id = cm.athlete_id
      where cm.conversation_id = p_conversation_id
        and a.user_id = auth.uid()
    )
  order by m.created_at asc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;


ALTER FUNCTION "public"."list_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_dm_inbox"("p_athlete_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.last_message_at desc nulls last),
  '[]'::jsonb)
  from (
    select
      c.id as conversation_id,
      friend_a.id as friend_id,
      friend_a.username as friend_username,
      friend_a.avatar_url as friend_avatar_url,
      (
        select msg.content
        from public.conversation_messages msg
        where msg.conversation_id = c.id
        order by msg.created_at desc
        limit 1
      ) as last_message,
      (
        select msg.created_at
        from public.conversation_messages msg
        where msg.conversation_id = c.id
        order by msg.created_at desc
        limit 1
      ) as last_message_at,
      (
        select msg.athlete_id
        from public.conversation_messages msg
        where msg.conversation_id = c.id
        order by msg.created_at desc
        limit 1
      ) as last_message_sender_id
    from public.conversations c
    join public.conversation_members my_m on my_m.conversation_id = c.id and my_m.athlete_id = p_athlete_id
    join public.conversation_members friend_m on friend_m.conversation_id = c.id and friend_m.athlete_id <> p_athlete_id
    join public.athletes friend_a on friend_a.id = friend_m.athlete_id
    join public.athletes me on me.id = p_athlete_id and me.user_id = auth.uid()
    where c.is_group = false
      and (select count(*)::int from public.conversation_members x where x.conversation_id = c.id) = 2
  ) t;
$$;


ALTER FUNCTION "public"."list_dm_inbox"("p_athlete_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_group_inbox"("p_athlete_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.sort_at desc nulls last),
    '[]'::jsonb
  )
  from (
    select distinct on (c.id)
      c.id as conversation_id,
      coalesce(pl.name, nullif(trim(c.name), ''), 'Group chat') as group_name,
      pl.id as league_id,
      pl.image_url as club_image_url,
      pl.league_type as club_league_type,
      (
        select msg.content
        from public.conversation_messages msg
        where msg.conversation_id = c.id
        order by msg.created_at desc
        limit 1
      ) as last_message,
      (
        select msg.created_at
        from public.conversation_messages msg
        where msg.conversation_id = c.id
        order by msg.created_at desc
        limit 1
      ) as last_message_at,
      coalesce(
        (
          select msg.created_at
          from public.conversation_messages msg
          where msg.conversation_id = c.id
          order by msg.created_at desc
          limit 1
        ),
        c.created_at
      ) as sort_at,
      (
        select msg.athlete_id
        from public.conversation_messages msg
        where msg.conversation_id = c.id
        order by msg.created_at desc
        limit 1
      ) as last_message_sender_id
    from public.conversations c
    join public.athletes me on me.id = p_athlete_id and (me.user_id = auth.uid() or me.id = auth.uid())
    left join public.private_leagues pl on pl.conversation_id = c.id
    where coalesce(c.is_group, false) = true
      and (
        exists (
          select 1
          from public.conversation_members cm
          where cm.conversation_id = c.id
            and cm.athlete_id = p_athlete_id
        )
        or exists (
          select 1
          from public.private_league_members plm
          where plm.league_id = pl.id
            and plm.athlete_id = p_athlete_id
            and plm.status = 'accepted'
        )
      )
    order by c.id, pl.name
  ) t;
$$;


ALTER FUNCTION "public"."list_group_inbox"("p_athlete_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."london_today"() RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$
  select timezone('Europe/London', now())::date;
$$;


ALTER FUNCTION "public"."london_today"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."london_week_start"("p_ts" timestamp with time zone) RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select date_trunc('week', timezone('Europe/London', p_ts)::timestamp)::date;
$$;


ALTER FUNCTION "public"."london_week_start"("p_ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_activity_inserted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."on_activity_inserted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_conversation_message_inserted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_is_group boolean;
  v_member_count integer;
  v_receiver uuid;
begin
  select coalesce(c.is_group, false)
  into v_is_group
  from public.conversations c
  where c.id = new.conversation_id;

  select count(*)::integer
  into v_member_count
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id;

  if v_is_group or v_member_count <> 2 then
    perform public.invoke_push_notification(
      'notify-new-message',
      jsonb_build_object(
        'conversation_id', new.conversation_id::text,
        'sender_athlete_id', new.athlete_id::text,
        'message_body', coalesce(new.content, '')
      )
    );
  else
    select cm.athlete_id
    into v_receiver
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.athlete_id <> new.athlete_id
    limit 1;

    if v_receiver is not null then
      perform public.invoke_push_notification(
        'notify-new-message',
        jsonb_build_object(
          'receiver_athlete_id', v_receiver::text,
          'sender_athlete_id', new.athlete_id::text,
          'preview', coalesce(nullif(trim(new.content), ''), 'New message')
        )
      );
    end if;
  end if;

  return new;
exception
  when others then
    raise warning 'on_conversation_message_inserted: %', sqlerrm;
    return new;
end;
$$;


ALTER FUNCTION "public"."on_conversation_message_inserted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_friendship_inserted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'pending' then
    perform public.invoke_push_notification(
      'notify-friend-request',
      jsonb_build_object(
        'from_athlete_id', new.athlete_id::text,
        'to_athlete_id', new.friend_id::text
      )
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."on_friendship_inserted"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_activity"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_athlete_id uuid;
  v_source_id text;
  v_duration_min numeric;
  v_avg_hr numeric;
  v_peak_hr numeric;
  v_distance_m numeric;
  v_pace numeric;
  v_max_hr integer;
  v_age integer;
  v_effective_max_hr numeric;
  v_hr_pct numeric;
  v_engine_score numeric := 0;
  v_run_score numeric := 0;
  v_status text := 'scored';
  v_reject_reason text;
  v_activity_type text;
  v_started_at timestamptz;
  v_season_id uuid;
  v_workout_id uuid;
  v_day date;
begin
  v_athlete_id := (payload->>'athlete_id')::uuid;
  v_source_id := payload->>'source_id';
  v_duration_min := (payload->>'duration_min')::numeric;
  v_avg_hr := (payload->>'avg_hr')::numeric;
  v_peak_hr := (payload->>'peak_hr')::numeric;
  v_distance_m := (payload->>'distance_m')::numeric;
  v_pace := (payload->>'avg_pace_per_km')::numeric;
  v_activity_type := payload->>'activity_type';
  v_started_at := (payload->>'started_at')::timestamptz;
  v_day := date_trunc('day', v_started_at)::date;

  if exists (select 1 from workouts where source_id = v_source_id) then
    return jsonb_build_object('status', 'duplicate', 'source_id', v_source_id);
  end if;

  select age, max_hr into v_age, v_max_hr from athletes where id = v_athlete_id;
  v_effective_max_hr := coalesce(v_max_hr, 220 - v_age);

  if not public.session_duration_qualifies_for_scoring(v_duration_min) then
    v_status := 'rejected';
    v_reject_reason := 'duration_too_short';
  end if;

  if v_duration_min > 120 then
    v_duration_min := 120;
  end if;

  -- RUN first; ENGINE only when run_score = 0
  if v_status != 'rejected'
    and v_pace is not null
    and lower(v_activity_type) in ('running', 'run', 'outdoor_run', 'indoor_run', 'trail_run', 'treadmill')
  then
    v_run_score := public.run_league_session_score(v_pace, v_duration_min);
  end if;

  if v_status != 'rejected' and v_run_score = 0 and v_avg_hr is not null then
    v_hr_pct := (v_avg_hr / v_effective_max_hr) * 100;
    v_engine_score := v_duration_min * public.engine_points_per_minute(v_hr_pct);

    if v_pace is not null and v_pace < 240 and v_hr_pct < 60 then
      v_status := 'rejected';
      v_reject_reason := 'implausible_pace_hr_combo';
      v_engine_score := 0;
    end if;
  end if;

  if v_engine_score = 0 and v_run_score = 0 and v_status != 'rejected' then
    v_status := 'rejected';
    v_reject_reason := coalesce(v_reject_reason, 'no_qualifying_score');
  end if;

  insert into workouts (
    athlete_id, source_id, started_at, duration_min, activity_type,
    avg_hr, peak_hr, distance_m, avg_pace_per_km,
    engine_score, run_score, status, reject_reason, raw_payload
  )
  values (
    v_athlete_id, v_source_id, v_started_at, v_duration_min, v_activity_type,
    v_avg_hr, v_peak_hr, v_distance_m, v_pace,
    v_engine_score, v_run_score, v_status, v_reject_reason, payload
  )
  returning id into v_workout_id;

  if v_status = 'scored' then
    perform public.reconcile_daily_workout_league_cap(v_athlete_id, v_day, 'run_score');
    perform public.reconcile_daily_workout_league_cap(v_athlete_id, v_day, 'engine_score');

    select run_score, engine_score
    into v_run_score, v_engine_score
    from workouts
    where id = v_workout_id;

    update athletes
    set total_score = total_score + v_engine_score + v_run_score,
        last_synced = now()
    where id = v_athlete_id;

    select id into v_season_id from seasons where is_active = true limit 1;

    if v_season_id is not null then
      if v_engine_score > 0 then
        insert into athlete_stats (athlete_id, season_id, category, score)
        values (v_athlete_id, v_season_id, 'engine', v_engine_score)
        on conflict (athlete_id, season_id, category)
        do update set score = athlete_stats.score + v_engine_score,
                      recorded_at = now();
      end if;

      if v_run_score > 0 then
        insert into athlete_stats (athlete_id, season_id, category, score)
        values (v_athlete_id, v_season_id, 'run', v_run_score)
        on conflict (athlete_id, season_id, category)
        do update set score = athlete_stats.score + v_run_score,
                      recorded_at = now();
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'engine_score', v_engine_score,
    'run_score', v_run_score,
    'reject_reason', v_reject_reason
  );
end;
$$;


ALTER FUNCTION "public"."process_activity"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_athlete_divisions_for_season"("p_season_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_inserted integer;
begin
  if p_season_id is null then
    raise exception 'reconcile_athlete_divisions_for_season: p_season_id is required';
  end if;

  if not exists (select 1 from public.seasons where id = p_season_id) then
    raise exception 'reconcile_athlete_divisions_for_season: season % not found', p_season_id;
  end if;

  insert into public.athlete_divisions (athlete_id, season_id, league, division)
  select a.id, p_season_id, l.league, 'Open'
  from public.athletes a
  cross join (values ('engine'), ('run')) as l(league)
  where not exists (
    select 1
    from public.athlete_divisions ad
    where ad.athlete_id = a.id
      and ad.season_id = p_season_id
      and ad.league = l.league
  );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;


ALTER FUNCTION "public"."reconcile_athlete_divisions_for_season"("p_season_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_daily_workout_league_cap"("p_athlete_id" "uuid", "p_day" "date", "p_score_column" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_rec record;
  v_season_id uuid;
  v_category text;
begin
  if p_score_column not in ('run_score', 'engine_score') then
    raise exception 'invalid score column %', p_score_column;
  end if;

  v_category := case when p_score_column = 'run_score' then 'run' else 'engine' end;
  select id into v_season_id from seasons where is_active = true limit 1;

  for v_rec in
    execute format(
      $q$
      select id, %1$I::numeric as league_score
      from workouts
      where athlete_id = $1
        and status = 'scored'
        and date_trunc('day', started_at)::date = $2
        and coalesce(%1$I, 0) > 0
      order by %1$I desc, started_at desc
      offset 2
      $q$,
      p_score_column
    )
    using p_athlete_id, p_day
  loop
    execute format('update workouts set %I = 0 where id = $1', p_score_column) using v_rec.id;

    update athletes
    set total_score = greatest(0, total_score - v_rec.league_score)
    where id = p_athlete_id;

    if v_season_id is not null then
      update athlete_stats
      set score = greatest(0, score - v_rec.league_score)
      where athlete_id = p_athlete_id
        and season_id = v_season_id
        and category = v_category;
    end if;
  end loop;
end;
$_$;


ALTER FUNCTION "public"."reconcile_daily_workout_league_cap"("p_athlete_id" "uuid", "p_day" "date", "p_score_column" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_membership_season_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select id
  from (
    select id, 0 as priority, starts_at
    from public.seasons
    where is_active

    union all

    select id, 1 as priority, starts_at
    from public.seasons
    where not is_active
      and starts_at > now()
  ) s
  order by priority asc, starts_at asc
  limit 1;
$$;


ALTER FUNCTION "public"."resolve_membership_season_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_next_season_id"("p_ending_season_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select s.id
  from public.seasons s
  join public.seasons ending on ending.id = p_ending_season_id
  where s.id <> ending.id
    and s.starts_at >= ending.ends_at
  order by s.starts_at asc
  limit 1;
$$;


ALTER FUNCTION "public"."resolve_next_season_id"("p_ending_season_id" "uuid") OWNER TO "postgres";




CREATE OR REPLACE FUNCTION "public"."run_league_session_score"("p_pace_seconds" numeric, "p_duration_minutes" numeric) RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_ppm numeric;
  v_duration numeric;
begin
  v_duration := least(coalesce(p_duration_minutes, 0), 120);
  if v_duration <= 15 then
    return 0;
  end if;

  v_ppm := public.run_ppm_from_pace(p_pace_seconds);
  if v_ppm <= 0 then
    return 0;
  end if;

  return ceil(v_ppm * v_duration)::integer;
end;
$$;


ALTER FUNCTION "public"."run_league_session_score"("p_pace_seconds" numeric, "p_duration_minutes" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_ppm_from_pace"("p_pace_seconds" numeric) RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_pace integer;
  v_ppm numeric;
begin
  if p_pace_seconds is null or p_pace_seconds <= 0 then
    return 0;
  end if;

  v_pace := round(p_pace_seconds)::integer;

  if v_pace <= 180 then
    return 5.60;
  end if;

  if v_pace > 450 then
    return 0;
  end if;

  select ppm into v_ppm from public.run_ppm_lookup where pace_seconds = v_pace;
  return coalesce(v_ppm, 0);
end;
$$;


ALTER FUNCTION "public"."run_ppm_from_pace"("p_pace_seconds" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."season_id_for_london_week"("p_week_start" "date") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select s.id
  from public.seasons s
  where p_week_start >= public.london_week_start(s.starts_at)
    and p_week_start <= public.london_week_start(s.ends_at - interval '1 second')
  order by s.starts_at desc
  limit 1;
$$;


ALTER FUNCTION "public"."season_id_for_london_week"("p_week_start" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_athlete_id" "uuid", "p_content" "text") RETURNS TABLE("id" "uuid", "athlete_id" "uuid", "content" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id uuid;
  v_created timestamptz;
  v_text text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_text := trim(p_content);
  if v_text is null or v_text = '' then
    raise exception 'Message is empty';
  end if;

  perform public.ensure_athlete_user_id(p_athlete_id);

  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.athlete_id = p_athlete_id
  ) then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and a.user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
  end if;

  insert into public.conversation_messages (conversation_id, athlete_id, content)
  values (p_conversation_id, p_athlete_id, v_text)
  returning conversation_messages.id, conversation_messages.created_at
  into v_id, v_created;

  return query
  select v_id, p_athlete_id, v_text, v_created;
end;
$$;


ALTER FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_athlete_id" "uuid", "p_content" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."session_counts_for_consistency_bonus"("p_session_score" numeric) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(p_session_score, 0) > 0;
$$;


ALTER FUNCTION "public"."session_counts_for_consistency_bonus"("p_session_score" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."session_duration_qualifies_for_scoring"("p_duration_minutes" numeric) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(p_duration_minutes, 0) > 15;
$$;


ALTER FUNCTION "public"."session_duration_qualifies_for_scoring"("p_duration_minutes" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_apple_workouts"("p_athlete_id" "uuid", "p_workouts" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  w jsonb;
  v_payload jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  if p_workouts is null or jsonb_typeof(p_workouts) <> 'array' then
    raise exception 'Expected workouts array';
  end if;

  for w in select value from jsonb_array_elements(p_workouts)
  loop
    v_payload := jsonb_build_object(
      'athlete_id',
      p_athlete_id,
      'source_id',
      w->>'sourceId',
      'started_at',
      w->>'startedAt',
      'duration_min',
      nullif(w->>'durationMin', '')::numeric,
      'activity_type',
      w->>'activityType',
      'avg_hr',
      nullif(w->>'avgHr', '')::numeric,
      'peak_hr',
      nullif(w->>'peakHr', '')::numeric,
      'distance_m',
      nullif(w->>'distanceM', '')::numeric,
      'avg_pace_per_km',
      nullif(w->>'avgPacePerKm', '')::numeric,
      'raw_payload',
      w
    );
    v_result := public.process_activity(v_payload);
    v_results := v_results || jsonb_build_array(v_result);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('processed', v_count, 'results', v_results);
end;
$$;


ALTER FUNCTION "public"."sync_apple_workouts"("p_athlete_id" "uuid", "p_workouts" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text" DEFAULT NULL::"text", "p_image_url" "text" DEFAULT NULL::"text", "p_is_public" boolean DEFAULT NULL::boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_conv_id uuid;
  v_new_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_athlete_user_id(p_athlete_id);

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from public.private_leagues pl
    where pl.id = p_league_id
      and pl.created_by = p_athlete_id
  ) then
    raise exception 'Club not found or not creator';
  end if;

  select pl.conversation_id into v_conv_id
  from public.private_leagues pl
  where pl.id = p_league_id;

  v_new_name := nullif(trim(p_name), '');

  update public.private_leagues pl
  set
    name = coalesce(v_new_name, pl.name),
    image_url = coalesce(p_image_url, pl.image_url),
    is_public = coalesce(p_is_public, pl.is_public)
  where pl.id = p_league_id;

  if v_conv_id is not null and v_new_name is not null then
    update public.conversations c
    set name = v_new_name
    where c.id = v_conv_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text", "p_image_url" "text", "p_is_public" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text" DEFAULT NULL::"text", "p_image_url" "text" DEFAULT NULL::"text", "p_is_public" boolean DEFAULT NULL::boolean, "p_gender" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_conv_id uuid;
  v_new_name text;
  v_gender text;
  v_creator_gender text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_athlete_user_id(p_athlete_id);

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  if not exists (
    select 1
    from public.private_leagues pl
    where pl.id = p_league_id
      and pl.created_by = p_athlete_id
  ) then
    raise exception 'Club not found or not creator';
  end if;

  select pl.conversation_id into v_conv_id
  from public.private_leagues pl
  where pl.id = p_league_id;

  v_new_name := nullif(trim(p_name), '');

  if p_gender is not null then
    v_gender := nullif(trim(p_gender), '');
    if v_gender is not null and v_gender not in ('male', 'female', 'mixed') then
      raise exception 'Invalid club gender';
    end if;

    if v_gender is not null and v_gender <> 'mixed' then
      select a.gender into v_creator_gender
      from public.athletes a
      where a.id = p_athlete_id;

      if v_creator_gender is null or v_creator_gender <> v_gender then
        if v_gender = 'male' then
          raise exception 'You can only set a men''s club if your profile gender is male';
        elsif v_gender = 'female' then
          raise exception 'You can only set a women''s club if your profile gender is female';
        else
          raise exception 'Gender mismatch';
        end if;
      end if;
    end if;
  end if;

  update public.private_leagues pl
  set
    name = coalesce(v_new_name, pl.name),
    image_url = coalesce(p_image_url, pl.image_url),
    is_public = coalesce(p_is_public, pl.is_public),
    gender = coalesce(v_gender, pl.gender)
  where pl.id = p_league_id;

  if v_conv_id is not null and v_new_name is not null then
    update public.conversations c
    set name = v_new_name
    where c.id = v_conv_id;
  end if;
end;
$$;


ALTER FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text", "p_image_url" "text", "p_is_public" boolean, "p_gender" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_is_conversation_member"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  is_member boolean;
begin
  perform set_config('row_security', 'off', true);

  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.athlete_id in (select public.current_athlete_ids())
  )
  into is_member;

  return coalesce(is_member, false);
end;
$$;


ALTER FUNCTION "public"."user_is_conversation_member"("p_conversation_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid",
    "season_id" "uuid",
    "league_type" "text" NOT NULL,
    "activity_type" "text",
    "duration_minutes" numeric NOT NULL,
    "avg_pace_seconds" numeric,
    "avg_hr_percent" numeric,
    "activity_date" "date" NOT NULL,
    "source" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "status" "text" DEFAULT 'scored'::"text",
    "is_valid" boolean DEFAULT true,
    "hr_sample_count" integer DEFAULT 0,
    "status_explanation" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "reject_reason" "text",
    "engine_score" numeric,
    "run_score" numeric,
    "raw_data" "jsonb",
    "duration_seconds" integer,
    "avg_hr" integer,
    "avg_pace_ms" numeric,
    "distance_meters" numeric,
    "workout_type" "text",
    "workout_start_time" timestamp with time zone
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_achievements" (
    "athlete_id" "uuid" NOT NULL,
    "achievement_id" "text" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "celebrated_at" timestamp with time zone,
    CONSTRAINT "athlete_achievements_id_check" CHECK (("achievement_id" = ANY (ARRAY['founder'::"text", 'century'::"text", 'engine-room'::"text", 'pacemaker'::"text", 'double-day'::"text", 'iron-week'::"text", 'promoted'::"text", 'top-3'::"text", 'recruiter'::"text"])))
);


ALTER TABLE "public"."athlete_achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_divisions" (
    "athlete_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "league" "text" NOT NULL,
    "division" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "athlete_divisions_league_check" CHECK (("league" = ANY (ARRAY['engine'::"text", 'run'::"text"])))
);


ALTER TABLE "public"."athlete_divisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_friend_rank_snapshots" (
    "athlete_low_id" "uuid" NOT NULL,
    "athlete_high_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "low_rank" integer NOT NULL,
    "high_rank" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "athlete_friend_rank_snapshots_category_check" CHECK (("category" = ANY (ARRAY['engine'::"text", 'run'::"text"]))),
    CONSTRAINT "athlete_friend_rank_snapshots_order" CHECK (("athlete_low_id" < "athlete_high_id"))
);


ALTER TABLE "public"."athlete_friend_rank_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athlete_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid",
    "season_id" "uuid",
    "category" "text" NOT NULL,
    "rank" integer,
    "score" numeric DEFAULT 0,
    "engine_score" numeric DEFAULT 0,
    "run_score" numeric DEFAULT 0,
    "engine_rank" integer,
    "run_rank" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "total_score" numeric DEFAULT 0,
    "engine_weekly_change" integer DEFAULT 0,
    "run_weekly_change" integer DEFAULT 0,
    "recorded_at" timestamp with time zone DEFAULT "now"(),
    "engine_places_to_promotion" integer DEFAULT 0,
    "run_places_to_promotion" integer DEFAULT 0,
    "engine_places_to_relegation" integer DEFAULT 0,
    "run_places_to_relegation" integer DEFAULT 0,
    "engine_division" "text" DEFAULT 'Open'::"text",
    "run_division" "text" DEFAULT 'Open'::"text",
    "selected_leagues" "text"[],
    "consistency_bonus" numeric DEFAULT 0,
    "last_activity_at" timestamp with time zone
);


ALTER TABLE "public"."athlete_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."athletes" (
    "id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "age" integer DEFAULT 30 NOT NULL,
    "max_hr" integer,
    "total_score" numeric DEFAULT 0 NOT NULL,
    "last_synced" timestamp with time zone,
    "data_source" "text" DEFAULT 'apple'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "username" "text",
    "date_of_birth" "date",
    "gender" "text",
    "country" "text",
    "selected_leagues" "text"[],
    "user_id" "uuid",
    "avatar_url" "text",
    "observed_max_hr" integer,
    "primary_source" "text" DEFAULT 'apple'::"text",
    "wearables" "text"[],
    "subscription_tier" "text" DEFAULT 'free'::"text",
    "subscription_expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true,
    "is_verified" boolean DEFAULT false,
    "health_data_enabled" boolean DEFAULT true,
    "profile_public" boolean DEFAULT true,
    "has_seen_welcome" boolean DEFAULT false,
    "selected_league" "text",
    "last_sync_at" timestamp with time zone,
    "is_premium" boolean DEFAULT false,
    "premium_expires_at" timestamp with time zone,
    "terra_user_id" "text",
    "onboarding_complete" boolean DEFAULT false,
    "weight_kg" numeric,
    "profile_image_url" "text",
    "max_hr_source" "text",
    "health_data_sharing" boolean DEFAULT true NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."athletes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consistency_bonus_tiers" (
    "league" "text" NOT NULL,
    "min_workouts" integer NOT NULL,
    "bonus_points" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "consistency_bonus_tiers_bonus_points_check" CHECK (("bonus_points" >= 0)),
    CONSTRAINT "consistency_bonus_tiers_league_check" CHECK (("league" = ANY (ARRAY['engine'::"text", 'run'::"text"]))),
    CONSTRAINT "consistency_bonus_tiers_min_workouts_check" CHECK (("min_workouts" > 0))
);


ALTER TABLE "public"."consistency_bonus_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "athlete_id" "uuid",
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversation_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "athlete_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversation_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text",
    "is_group" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direct_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid",
    "receiver_id" "uuid",
    "conversation_id" "uuid",
    "content" "text" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text",
    "gif_url" "text",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."direct_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."division_rules" (
    "division" "text" NOT NULL,
    "promote_percent" numeric(5,2),
    "promote_min_count" integer,
    "relegate_percent" numeric(5,2),
    "promotes_to" "text",
    "relegates_to" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "division_rules_division_check" CHECK (("division" = ANY (ARRAY['Open'::"text", 'Challenger'::"text", 'Pro'::"text", 'Elite'::"text"]))),
    CONSTRAINT "division_rules_no_self_promote" CHECK (("promotes_to" IS DISTINCT FROM "division")),
    CONSTRAINT "division_rules_no_self_relegate" CHECK (("relegates_to" IS DISTINCT FROM "division")),
    CONSTRAINT "division_rules_promote_min_count_check" CHECK ((("promote_min_count" IS NULL) OR ("promote_min_count" >= 0))),
    CONSTRAINT "division_rules_promote_percent_check" CHECK ((("promote_percent" IS NULL) OR (("promote_percent" >= (0)::numeric) AND ("promote_percent" <= (100)::numeric)))),
    CONSTRAINT "division_rules_relegate_percent_check" CHECK ((("relegate_percent" IS NULL) OR (("relegate_percent" >= (0)::numeric) AND ("relegate_percent" <= (100)::numeric))))
);


ALTER TABLE "public"."division_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."engine_ppm_lookup" (
    "hr_percent_tenths" integer NOT NULL,
    "ppm" numeric(4,2) NOT NULL
);


ALTER TABLE "public"."engine_ppm_lookup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid",
    "friend_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."leaderboard" AS
 SELECT "id",
    "display_name",
    "total_score",
    "rank"() OVER (ORDER BY "total_score" DESC) AS "rank"
   FROM "public"."athletes" "a";


ALTER VIEW "public"."leaderboard" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."lifetime_leaderboard" AS
 SELECT "id",
    "display_name",
    "total_score",
    ("row_number"() OVER (ORDER BY "total_score" DESC NULLS LAST, "created_at", "id"))::integer AS "rank"
   FROM "public"."athletes" "a";


ALTER VIEW "public"."lifetime_leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid",
    "athlete_id" "uuid",
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "athlete_id" "uuid",
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."private_league_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "league_id" "uuid",
    "athlete_id" "uuid",
    "invited_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "joined_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."private_league_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."private_leagues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid",
    "league_type" "text" DEFAULT 'both'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "image_url" "text",
    "conversation_id" "uuid",
    "invite_code" "text" DEFAULT "substr"("md5"(("random"())::"text"), 1, 8),
    "is_public" boolean DEFAULT false NOT NULL,
    "gender" "text" DEFAULT 'mixed'::"text" NOT NULL,
    CONSTRAINT "private_leagues_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'mixed'::"text"])))
);


ALTER TABLE "public"."private_leagues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotion_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "league" "text" NOT NULL,
    "from_division" "text" NOT NULL,
    "to_division" "text" NOT NULL,
    "result" "text" NOT NULL,
    "final_rank" integer NOT NULL,
    "final_points" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotion_history_final_rank_check" CHECK (("final_rank" > 0)),
    CONSTRAINT "promotion_history_league_check" CHECK (("league" = ANY (ARRAY['engine'::"text", 'run'::"text"]))),
    CONSTRAINT "promotion_history_result_check" CHECK (("result" = ANY (ARRAY['promoted'::"text", 'relegated'::"text", 'held'::"text"])))
);


ALTER TABLE "public"."promotion_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotion_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "min_workouts_for_promotion" integer DEFAULT 3 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotion_settings_id_check" CHECK ("id"),
    CONSTRAINT "promotion_settings_min_workouts_for_promotion_check" CHECK (("min_workouts_for_promotion" >= 0))
);


ALTER TABLE "public"."promotion_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."run_ppm_lookup" (
    "pace_seconds" integer NOT NULL,
    "ppm" numeric(4,2) NOT NULL
);


ALTER TABLE "public"."run_ppm_lookup" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."season_division_leaderboard" AS
 SELECT "ad"."athlete_id" AS "id",
    "a"."display_name",
    "ad"."season_id",
    "ad"."league",
    "ad"."division",
    COALESCE("ast"."score", (0)::numeric) AS "season_score",
    "ast"."recorded_at",
    ("row_number"() OVER (PARTITION BY "ad"."season_id", "ad"."league", "ad"."division" ORDER BY COALESCE("ast"."score", (0)::numeric) DESC, "ast"."recorded_at", "ad"."athlete_id"))::integer AS "rank"
   FROM (("public"."athlete_divisions" "ad"
     JOIN "public"."athletes" "a" ON (("a"."id" = "ad"."athlete_id")))
     LEFT JOIN "public"."athlete_stats" "ast" ON ((("ast"."athlete_id" = "ad"."athlete_id") AND ("ast"."season_id" = "ad"."season_id") AND ("ast"."category" = "ad"."league"))))
  WHERE ("ad"."league" = ANY (ARRAY['engine'::"text", 'run'::"text"]));


ALTER VIEW "public"."season_division_leaderboard" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."season_overall_leaderboard" AS
 SELECT "ad"."athlete_id" AS "id",
    "a"."display_name",
    "ad"."season_id",
    "ad"."league",
    "ad"."division",
    COALESCE("ast"."score", (0)::numeric) AS "season_score",
    "ast"."recorded_at",
    ("row_number"() OVER (PARTITION BY "ad"."season_id", "ad"."league" ORDER BY COALESCE("ast"."score", (0)::numeric) DESC, "ast"."recorded_at", "ad"."athlete_id"))::integer AS "rank"
   FROM (("public"."athlete_divisions" "ad"
     JOIN "public"."athletes" "a" ON (("a"."id" = "ad"."athlete_id")))
     LEFT JOIN "public"."athlete_stats" "ast" ON ((("ast"."athlete_id" = "ad"."athlete_id") AND ("ast"."season_id" = "ad"."season_id") AND ("ast"."category" = "ad"."league"))))
  WHERE ("ad"."league" = ANY (ARRAY['engine'::"text", 'run'::"text"]));


ALTER VIEW "public"."season_overall_leaderboard" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."season_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "league" "text" NOT NULL,
    "division" "text" NOT NULL,
    "rank" integer NOT NULL,
    "points" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "season_snapshots_league_check" CHECK (("league" = ANY (ARRAY['engine'::"text", 'run'::"text"]))),
    CONSTRAINT "season_snapshots_rank_check" CHECK (("rank" > 0))
);


ALTER TABLE "public"."season_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seasons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."seasons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."support_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_diagnostics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid",
    "hr_samples_total" integer,
    "workouts_detected" "jsonb",
    "rejected_clusters" "jsonb",
    "inserted" integer,
    "duplicates" integer,
    "raw_summary" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sync_diagnostics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."terra_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid",
    "terra_user_id" "text",
    "provider" "text",
    "connected_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."terra_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waitlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."waitlist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_consistency_bonuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "season_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "qualifying_count" integer NOT NULL,
    "bonus_points" integer NOT NULL,
    "awarded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "league" "text" NOT NULL,
    CONSTRAINT "weekly_consistency_bonuses_league_check" CHECK (("league" = ANY (ARRAY['engine'::"text", 'run'::"text"])))
);


ALTER TABLE "public"."weekly_consistency_bonuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whoop_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "whoop_user_id" "text",
    "access_token" "text" NOT NULL,
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."whoop_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "athlete_id" "uuid" NOT NULL,
    "source_id" "text" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "duration_min" numeric NOT NULL,
    "activity_type" "text",
    "avg_hr" numeric,
    "peak_hr" numeric,
    "distance_m" numeric,
    "avg_pace_per_km" numeric,
    "engine_score" numeric DEFAULT 0 NOT NULL,
    "run_score" numeric DEFAULT 0 NOT NULL,
    "score" numeric GENERATED ALWAYS AS (("engine_score" + "run_score")) STORED,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reject_reason" "text",
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "duration_minutes" numeric,
    "activity_date" "date",
    "avg_hr_percent" numeric
);


ALTER TABLE "public"."workouts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_athlete_id_source_source_id_key" UNIQUE ("athlete_id", "source", "source_id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athlete_achievements"
    ADD CONSTRAINT "athlete_achievements_pkey" PRIMARY KEY ("athlete_id", "achievement_id");



ALTER TABLE ONLY "public"."athlete_divisions"
    ADD CONSTRAINT "athlete_divisions_pkey" PRIMARY KEY ("athlete_id", "season_id", "league");



ALTER TABLE ONLY "public"."athlete_friend_rank_snapshots"
    ADD CONSTRAINT "athlete_friend_rank_snapshots_pkey" PRIMARY KEY ("athlete_low_id", "athlete_high_id", "season_id", "category");



ALTER TABLE ONLY "public"."athlete_stats"
    ADD CONSTRAINT "athlete_stats_athlete_id_season_id_category_key" UNIQUE ("athlete_id", "season_id", "category");



ALTER TABLE ONLY "public"."athlete_stats"
    ADD CONSTRAINT "athlete_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."athletes"
    ADD CONSTRAINT "athletes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consistency_bonus_tiers"
    ADD CONSTRAINT "consistency_bonus_tiers_pkey" PRIMARY KEY ("league", "min_workouts");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_athlete_id_key" UNIQUE ("conversation_id", "athlete_id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."division_rules"
    ADD CONSTRAINT "division_rules_pkey" PRIMARY KEY ("division");



ALTER TABLE ONLY "public"."engine_ppm_lookup"
    ADD CONSTRAINT "engine_ppm_lookup_pkey" PRIMARY KEY ("hr_percent_tenths");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_athlete_id_friend_id_key" UNIQUE ("athlete_id", "friend_id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_athlete_id_emoji_key" UNIQUE ("message_id", "athlete_id", "emoji");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."private_league_members"
    ADD CONSTRAINT "private_league_members_league_id_athlete_id_key" UNIQUE ("league_id", "athlete_id");



ALTER TABLE ONLY "public"."private_league_members"
    ADD CONSTRAINT "private_league_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."private_leagues"
    ADD CONSTRAINT "private_leagues_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."private_leagues"
    ADD CONSTRAINT "private_leagues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_history"
    ADD CONSTRAINT "promotion_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_settings"
    ADD CONSTRAINT "promotion_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."run_ppm_lookup"
    ADD CONSTRAINT "run_ppm_lookup_pkey" PRIMARY KEY ("pace_seconds");



ALTER TABLE ONLY "public"."season_snapshots"
    ADD CONSTRAINT "season_snapshots_athlete_id_season_id_league_key" UNIQUE ("athlete_id", "season_id", "league");



ALTER TABLE ONLY "public"."season_snapshots"
    ADD CONSTRAINT "season_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seasons"
    ADD CONSTRAINT "seasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_diagnostics"
    ADD CONSTRAINT "sync_diagnostics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terra_connections"
    ADD CONSTRAINT "terra_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terra_connections"
    ADD CONSTRAINT "terra_connections_terra_user_id_key" UNIQUE ("terra_user_id");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."waitlist"
    ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_consistency_bonuses"
    ADD CONSTRAINT "weekly_consistency_bonuses_one_per_week_league" UNIQUE ("athlete_id", "season_id", "league", "week_start");



ALTER TABLE ONLY "public"."weekly_consistency_bonuses"
    ADD CONSTRAINT "weekly_consistency_bonuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whoop_connections"
    ADD CONSTRAINT "whoop_connections_athlete_id_key" UNIQUE ("athlete_id");



ALTER TABLE ONLY "public"."whoop_connections"
    ADD CONSTRAINT "whoop_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_source_id_key" UNIQUE ("source_id");



CREATE UNIQUE INDEX "activities_athlete_id_workout_start_time_key" ON "public"."activities" USING "btree" ("athlete_id", "workout_start_time");



CREATE UNIQUE INDEX "activities_athlete_workout_start_unique" ON "public"."activities" USING "btree" ("athlete_id", "workout_start_time");



CREATE UNIQUE INDEX "activities_dedup" ON "public"."activities" USING "btree" ("athlete_id", "workout_start_time") WHERE ("workout_start_time" IS NOT NULL);



CREATE INDEX "athlete_achievements_athlete_id_idx" ON "public"."athlete_achievements" USING "btree" ("athlete_id");



CREATE INDEX "athlete_divisions_athlete_season_idx" ON "public"."athlete_divisions" USING "btree" ("athlete_id", "season_id");



CREATE INDEX "athlete_divisions_season_league_division_idx" ON "public"."athlete_divisions" USING "btree" ("season_id", "league", "division");



CREATE INDEX "athlete_friend_rank_snapshots_season_category_idx" ON "public"."athlete_friend_rank_snapshots" USING "btree" ("season_id", "category");



CREATE UNIQUE INDEX "athletes_username_lower_idx" ON "public"."athletes" USING "btree" ("lower"("username"));



CREATE UNIQUE INDEX "athletes_username_lower_key" ON "public"."athletes" USING "btree" ("lower"("username"));



CREATE INDEX "conversation_messages_conversation_id_idx" ON "public"."conversation_messages" USING "btree" ("conversation_id");



CREATE INDEX "friendships_friend_id_idx" ON "public"."friendships" USING "btree" ("friend_id");



CREATE INDEX "private_league_members_athlete_id_idx" ON "public"."private_league_members" USING "btree" ("athlete_id");



CREATE INDEX "promotion_history_athlete_created_idx" ON "public"."promotion_history" USING "btree" ("athlete_id", "created_at" DESC);



CREATE INDEX "promotion_history_season_league_idx" ON "public"."promotion_history" USING "btree" ("season_id", "league");



CREATE INDEX "season_snapshots_athlete_idx" ON "public"."season_snapshots" USING "btree" ("athlete_id");



CREATE INDEX "season_snapshots_season_league_rank_idx" ON "public"."season_snapshots" USING "btree" ("season_id", "league", "rank");



CREATE UNIQUE INDEX "seasons_one_active_idx" ON "public"."seasons" USING "btree" ("is_active") WHERE "is_active";



CREATE INDEX "terra_connections_athlete_id_idx" ON "public"."terra_connections" USING "btree" ("athlete_id");



CREATE INDEX "weekly_consistency_bonuses_athlete_idx" ON "public"."weekly_consistency_bonuses" USING "btree" ("athlete_id");



CREATE INDEX "weekly_consistency_bonuses_season_league_idx" ON "public"."weekly_consistency_bonuses" USING "btree" ("season_id", "league", "week_start");



CREATE INDEX "whoop_connections_athlete_id_idx" ON "public"."whoop_connections" USING "btree" ("athlete_id");



CREATE OR REPLACE TRIGGER "athlete_divisions_set_updated_at" BEFORE UPDATE ON "public"."athlete_divisions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "athletes_ensure_open_divisions" AFTER INSERT ON "public"."athletes" FOR EACH ROW EXECUTE FUNCTION "public"."athletes_ensure_open_divisions_trg"();



CREATE OR REPLACE TRIGGER "consistency_bonus_tiers_set_updated_at" BEFORE UPDATE ON "public"."consistency_bonus_tiers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "conversation_messages_push" AFTER INSERT ON "public"."conversation_messages" FOR EACH ROW EXECUTE FUNCTION "public"."on_conversation_message_inserted"();



CREATE OR REPLACE TRIGGER "division_rules_set_updated_at" BEFORE UPDATE ON "public"."division_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "on_activity_inserted" AFTER INSERT ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."on_activity_inserted"();



CREATE OR REPLACE TRIGGER "on_friendship_inserted" AFTER INSERT ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."on_friendship_inserted"();



CREATE OR REPLACE TRIGGER "promotion_settings_set_updated_at" BEFORE UPDATE ON "public"."promotion_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id");



ALTER TABLE ONLY "public"."athlete_achievements"
    ADD CONSTRAINT "athlete_achievements_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_divisions"
    ADD CONSTRAINT "athlete_divisions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_divisions"
    ADD CONSTRAINT "athlete_divisions_division_fkey" FOREIGN KEY ("division") REFERENCES "public"."division_rules"("division");



ALTER TABLE ONLY "public"."athlete_divisions"
    ADD CONSTRAINT "athlete_divisions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_friend_rank_snapshots"
    ADD CONSTRAINT "athlete_friend_rank_snapshots_athlete_high_id_fkey" FOREIGN KEY ("athlete_high_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_friend_rank_snapshots"
    ADD CONSTRAINT "athlete_friend_rank_snapshots_athlete_low_id_fkey" FOREIGN KEY ("athlete_low_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_friend_rank_snapshots"
    ADD CONSTRAINT "athlete_friend_rank_snapshots_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."athlete_stats"
    ADD CONSTRAINT "athlete_stats_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id");



ALTER TABLE ONLY "public"."athlete_stats"
    ADD CONSTRAINT "athlete_stats_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id");



ALTER TABLE ONLY "public"."athletes"
    ADD CONSTRAINT "athletes_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."athletes"
    ADD CONSTRAINT "athletes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_messages"
    ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."direct_messages"
    ADD CONSTRAINT "direct_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."division_rules"
    ADD CONSTRAINT "division_rules_promotes_to_fkey" FOREIGN KEY ("promotes_to") REFERENCES "public"."division_rules"("division");



ALTER TABLE ONLY "public"."division_rules"
    ADD CONSTRAINT "division_rules_relegates_to_fkey" FOREIGN KEY ("relegates_to") REFERENCES "public"."division_rules"("division");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."direct_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."private_leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."private_league_members"
    ADD CONSTRAINT "private_league_members_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."private_league_members"
    ADD CONSTRAINT "private_league_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."athletes"("id");



ALTER TABLE ONLY "public"."private_league_members"
    ADD CONSTRAINT "private_league_members_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."private_leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."private_leagues"
    ADD CONSTRAINT "private_leagues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_history"
    ADD CONSTRAINT "promotion_history_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_history"
    ADD CONSTRAINT "promotion_history_from_division_fkey" FOREIGN KEY ("from_division") REFERENCES "public"."division_rules"("division");



ALTER TABLE ONLY "public"."promotion_history"
    ADD CONSTRAINT "promotion_history_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."promotion_history"
    ADD CONSTRAINT "promotion_history_to_division_fkey" FOREIGN KEY ("to_division") REFERENCES "public"."division_rules"("division");



ALTER TABLE ONLY "public"."season_snapshots"
    ADD CONSTRAINT "season_snapshots_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."season_snapshots"
    ADD CONSTRAINT "season_snapshots_division_fkey" FOREIGN KEY ("division") REFERENCES "public"."division_rules"("division");



ALTER TABLE ONLY "public"."season_snapshots"
    ADD CONSTRAINT "season_snapshots_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."support_messages"
    ADD CONSTRAINT "support_messages_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sync_diagnostics"
    ADD CONSTRAINT "sync_diagnostics_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id");



ALTER TABLE ONLY "public"."terra_connections"
    ADD CONSTRAINT "terra_connections_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id");



ALTER TABLE ONLY "public"."weekly_consistency_bonuses"
    ADD CONSTRAINT "weekly_consistency_bonuses_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_consistency_bonuses"
    ADD CONSTRAINT "weekly_consistency_bonuses_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."whoop_connections"
    ADD CONSTRAINT "whoop_connections_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workouts"
    ADD CONSTRAINT "workouts_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id");



CREATE POLICY "Athletes add reactions" ON "public"."message_reactions" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "message_reactions"."athlete_id"))));



CREATE POLICY "Athletes create conversations" ON "public"."conversations" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "conversations"."created_by"))));



CREATE POLICY "Athletes create private leagues" ON "public"."private_leagues" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "private_leagues"."created_by"))));



CREATE POLICY "Athletes delete own connections" ON "public"."terra_connections" FOR DELETE USING (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "terra_connections"."athlete_id"))));



CREATE POLICY "Athletes insert memberships" ON "public"."private_league_members" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "private_league_members"."invited_by"))));



CREATE POLICY "Athletes insert own friendships" ON "public"."friendships" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "friendships"."athlete_id"))));



CREATE POLICY "Athletes join conversations" ON "public"."conversation_members" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "conversation_members"."athlete_id"))));



CREATE POLICY "Athletes read own connections" ON "public"."terra_connections" FOR SELECT USING (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "terra_connections"."athlete_id"))));



CREATE POLICY "Athletes read own friendships" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "friendships"."athlete_id"))) OR ("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "friendships"."friend_id")))));



CREATE POLICY "Athletes read own messages" ON "public"."direct_messages" FOR SELECT USING ((("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "direct_messages"."sender_id"))) OR ("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "direct_messages"."receiver_id"))) OR (("conversation_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members"
  WHERE (("conversation_members"."conversation_id" = "direct_messages"."conversation_id") AND ("conversation_members"."athlete_id" = ( SELECT "athletes"."id"
           FROM "public"."athletes"
          WHERE ("athletes"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "Athletes read reactions" ON "public"."message_reactions" FOR SELECT USING (true);



CREATE POLICY "Athletes remove reactions" ON "public"."message_reactions" FOR DELETE USING (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "message_reactions"."athlete_id"))));



CREATE POLICY "Athletes send messages" ON "public"."direct_messages" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "direct_messages"."sender_id"))));



CREATE POLICY "Athletes update own friendships" ON "public"."friendships" FOR UPDATE USING (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "friendships"."friend_id"))));



CREATE POLICY "Athletes update own memberships" ON "public"."private_league_members" FOR UPDATE USING (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "private_league_members"."athlete_id"))));



CREATE POLICY "Athletes update own messages" ON "public"."direct_messages" FOR UPDATE USING ((("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "direct_messages"."sender_id"))) OR ("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "direct_messages"."receiver_id")))));



CREATE POLICY "Delete own connections" ON "public"."terra_connections" FOR DELETE USING (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "terra_connections"."athlete_id"))));



CREATE POLICY "Insert own" ON "public"."athletes" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Insert own activities" ON "public"."activities" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "activities"."athlete_id"))));



CREATE POLICY "Insert own connections" ON "public"."terra_connections" FOR INSERT WITH CHECK (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "terra_connections"."athlete_id"))));



CREATE POLICY "Insert own workouts" ON "public"."workouts" FOR INSERT WITH CHECK (("auth"."uid"() = "athlete_id"));



CREATE POLICY "Members read conversation members" ON "public"."conversation_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "conversation_members"."conversation_id") AND ("cm"."athlete_id" = ( SELECT "athletes"."id"
           FROM "public"."athletes"
          WHERE ("athletes"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Members read conversation messages" ON "public"."conversation_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members"
  WHERE (("conversation_members"."conversation_id" = "conversation_messages"."conversation_id") AND ("conversation_members"."athlete_id" = ( SELECT "athletes"."id"
           FROM "public"."athletes"
          WHERE ("athletes"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Members read conversations" ON "public"."conversations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members"
  WHERE (("conversation_members"."conversation_id" = "conversations"."id") AND ("conversation_members"."athlete_id" = ( SELECT "athletes"."id"
           FROM "public"."athletes"
          WHERE ("athletes"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Members read messages" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."private_league_members"
  WHERE (("private_league_members"."league_id" = "messages"."league_id") AND ("private_league_members"."athlete_id" = ( SELECT "athletes"."id"
           FROM "public"."athletes"
          WHERE ("athletes"."user_id" = "auth"."uid"()))) AND ("private_league_members"."status" = 'accepted'::"text")))));



CREATE POLICY "Members read private leagues" ON "public"."private_leagues" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."private_league_members"
  WHERE (("private_league_members"."league_id" = "private_leagues"."id") AND ("private_league_members"."athlete_id" = ( SELECT "athletes"."id"
           FROM "public"."athletes"
          WHERE ("athletes"."user_id" = "auth"."uid"()))) AND ("private_league_members"."status" = 'accepted'::"text")))) OR ("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "private_leagues"."created_by")))));



CREATE POLICY "Members send conversation messages" ON "public"."conversation_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "conversation_messages"."athlete_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members"
  WHERE (("conversation_members"."conversation_id" = "conversation_messages"."conversation_id") AND ("conversation_members"."athlete_id" = ( SELECT "athletes"."id"
           FROM "public"."athletes"
          WHERE ("athletes"."user_id" = "auth"."uid"()))))))));



CREATE POLICY "Members send messages" ON "public"."messages" FOR INSERT WITH CHECK ((("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "messages"."athlete_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."private_league_members"
  WHERE (("private_league_members"."league_id" = "messages"."league_id") AND ("private_league_members"."athlete_id" = ( SELECT "athletes"."id"
           FROM "public"."athletes"
          WHERE ("athletes"."user_id" = "auth"."uid"()))) AND ("private_league_members"."status" = 'accepted'::"text"))))));



CREATE POLICY "Public read seasons" ON "public"."seasons" FOR SELECT USING (true);



CREATE POLICY "Read all" ON "public"."athletes" FOR SELECT USING (true);



CREATE POLICY "Read all stats" ON "public"."athlete_stats" FOR SELECT USING (true);



CREATE POLICY "Read own activities" ON "public"."activities" FOR SELECT USING (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "activities"."athlete_id"))));



CREATE POLICY "Read own connections" ON "public"."terra_connections" FOR SELECT USING (("auth"."uid"() = ( SELECT "athletes"."user_id"
   FROM "public"."athletes"
  WHERE ("athletes"."id" = "terra_connections"."athlete_id"))));



CREATE POLICY "Read own workouts" ON "public"."workouts" FOR SELECT USING (("auth"."uid"() = "athlete_id"));



CREATE POLICY "Update own" ON "public"."athletes" FOR UPDATE USING ((("auth"."uid"() = "id") OR ("user_id" = "auth"."uid"()))) WITH CHECK ((("auth"."uid"() = "id") OR ("user_id" = "auth"."uid"())));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athlete_achievements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "athlete_achievements_insert_own" ON "public"."athlete_achievements" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "athlete_achievements"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "athlete_achievements_select_own" ON "public"."athlete_achievements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "athlete_achievements"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "athlete_achievements_update_own" ON "public"."athlete_achievements" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "athlete_achievements"."athlete_id") AND ("a"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "athlete_achievements"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."athlete_divisions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "athlete_divisions_select_current_season" ON "public"."athlete_divisions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."seasons" "s"
  WHERE (("s"."id" = "athlete_divisions"."season_id") AND "s"."is_active"))));



CREATE POLICY "athlete_divisions_select_own" ON "public"."athlete_divisions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "athlete_divisions"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."athlete_friend_rank_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athlete_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."athletes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consistency_bonus_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consistency_bonus_tiers_admin_delete" ON "public"."consistency_bonus_tiers" FOR DELETE USING (COALESCE("public"."admin_is_caller_allowed"(), false));



CREATE POLICY "consistency_bonus_tiers_admin_insert" ON "public"."consistency_bonus_tiers" FOR INSERT WITH CHECK (COALESCE("public"."admin_is_caller_allowed"(), false));



CREATE POLICY "consistency_bonus_tiers_admin_update" ON "public"."consistency_bonus_tiers" FOR UPDATE USING (COALESCE("public"."admin_is_caller_allowed"(), false)) WITH CHECK (COALESCE("public"."admin_is_caller_allowed"(), false));



CREATE POLICY "consistency_bonus_tiers_select_public" ON "public"."consistency_bonus_tiers" FOR SELECT USING (true);



ALTER TABLE "public"."conversation_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_members_insert_dm_friend" ON "public"."conversation_members" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."conversations" "c"
     JOIN "public"."athletes" "ac" ON (("ac"."id" = "c"."created_by")))
  WHERE (("c"."id" = "conversation_members"."conversation_id") AND ("c"."is_group" = false) AND ("ac"."user_id" = "auth"."uid"())))) AND ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "conversation_members"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."friendships" "f"
     JOIN "public"."athletes" "me" ON (("me"."user_id" = "auth"."uid"())))
  WHERE (("f"."status" = 'accepted'::"text") AND ((("f"."athlete_id" = "me"."id") AND ("f"."friend_id" = "conversation_members"."athlete_id")) OR (("f"."friend_id" = "me"."id") AND ("f"."athlete_id" = "conversation_members"."athlete_id")))))))));



CREATE POLICY "conversation_members_insert_if_league_member" ON "public"."conversation_members" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "conversation_members"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM ("public"."private_leagues" "pl"
     JOIN "public"."private_league_members" "plm" ON ((("plm"."league_id" = "pl"."id") AND ("plm"."athlete_id" = "conversation_members"."athlete_id") AND ("plm"."status" = 'accepted'::"text"))))
  WHERE ("pl"."conversation_id" = "conversation_members"."conversation_id")))));



CREATE POLICY "conversation_members_insert_league_creator" ON "public"."conversation_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."private_leagues" "pl"
     JOIN "public"."athletes" "ac" ON (("ac"."id" = "pl"."created_by")))
  WHERE (("pl"."conversation_id" = "conversation_members"."conversation_id") AND ("ac"."user_id" = "auth"."uid"())))));



CREATE POLICY "conversation_members_insert_self" ON "public"."conversation_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "conversation_members"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "conversation_members_select" ON "public"."conversation_members" FOR SELECT USING ((("athlete_id" IN ( SELECT "public"."current_athlete_ids"() AS "current_athlete_ids")) OR "public"."user_is_conversation_member"("conversation_id")));



ALTER TABLE "public"."conversation_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_messages_insert_self" ON "public"."conversation_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "conversation_messages"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "conversation_messages_select" ON "public"."conversation_messages" FOR SELECT USING ("public"."user_is_conversation_member"("conversation_id"));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_insert_creator" ON "public"."conversations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."athletes" "ac"
  WHERE (("ac"."id" = "conversations"."created_by") AND ("ac"."user_id" = "auth"."uid"())))));



CREATE POLICY "conversations_select_member" ON "public"."conversations" FOR SELECT USING (("public"."user_is_conversation_member"("id") OR (EXISTS ( SELECT 1
   FROM "public"."athletes" "ac"
  WHERE (("ac"."id" = "conversations"."created_by") AND ("ac"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."direct_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."division_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "division_rules_admin_delete" ON "public"."division_rules" FOR DELETE USING (COALESCE("public"."admin_is_caller_allowed"(), false));



CREATE POLICY "division_rules_admin_insert" ON "public"."division_rules" FOR INSERT WITH CHECK (COALESCE("public"."admin_is_caller_allowed"(), false));



CREATE POLICY "division_rules_admin_update" ON "public"."division_rules" FOR UPDATE USING (COALESCE("public"."admin_is_caller_allowed"(), false)) WITH CHECK (COALESCE("public"."admin_is_caller_allowed"(), false));



CREATE POLICY "division_rules_select_public" ON "public"."division_rules" FOR SELECT USING (true);



ALTER TABLE "public"."engine_ppm_lookup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships_insert" ON "public"."friendships" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "friendships"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "friendships_select" ON "public"."friendships" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "friendships"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "friendships"."friend_id") AND ("a"."user_id" = "auth"."uid"()))))));



CREATE POLICY "friendships_update" ON "public"."friendships" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "friendships"."friend_id") AND ("a"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "friendships"."athlete_id") AND ("a"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."private_league_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "private_league_members_insert" ON "public"."private_league_members" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "private_league_members"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."private_leagues" "pl"
     JOIN "public"."athletes" "ac" ON (("ac"."id" = "pl"."created_by")))
  WHERE (("pl"."id" = "private_league_members"."league_id") AND ("ac"."user_id" = "auth"."uid"()))))));



CREATE POLICY "private_league_members_select" ON "public"."private_league_members" FOR SELECT USING ((("athlete_id" IN ( SELECT "public"."current_athlete_ids"() AS "current_athlete_ids")) OR "public"."caller_is_private_league_member"("league_id")));



CREATE POLICY "private_league_members_update" ON "public"."private_league_members" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "private_league_members"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."private_leagues" "pl"
     JOIN "public"."athletes" "ac" ON (("ac"."id" = "pl"."created_by")))
  WHERE (("pl"."id" = "private_league_members"."league_id") AND ("ac"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."private_leagues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "private_leagues_insert" ON "public"."private_leagues" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "private_leagues"."created_by") AND ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "private_leagues_select_member" ON "public"."private_leagues" FOR SELECT USING ((("created_by" IN ( SELECT "public"."current_athlete_ids"() AS "current_athlete_ids")) OR ("id" IN ( SELECT "public"."caller_private_league_ids"() AS "caller_private_league_ids"))));



CREATE POLICY "private_leagues_select_public" ON "public"."private_leagues" FOR SELECT USING (("is_public" = true));



CREATE POLICY "private_leagues_update_creator" ON "public"."private_leagues" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "private_leagues"."created_by") AND ("a"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."promotion_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promotion_history_select_own" ON "public"."promotion_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "promotion_history"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."promotion_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promotion_settings_admin_delete" ON "public"."promotion_settings" FOR DELETE USING (COALESCE("public"."admin_is_caller_allowed"(), false));



CREATE POLICY "promotion_settings_admin_insert" ON "public"."promotion_settings" FOR INSERT WITH CHECK (COALESCE("public"."admin_is_caller_allowed"(), false));



CREATE POLICY "promotion_settings_admin_update" ON "public"."promotion_settings" FOR UPDATE USING (COALESCE("public"."admin_is_caller_allowed"(), false)) WITH CHECK (COALESCE("public"."admin_is_caller_allowed"(), false));



CREATE POLICY "promotion_settings_select_public" ON "public"."promotion_settings" FOR SELECT USING (true);



ALTER TABLE "public"."run_ppm_lookup" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."season_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "season_snapshots_select_own" ON "public"."season_snapshots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "season_snapshots"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."seasons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."support_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_messages_insert_own" ON "public"."support_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "support_messages"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



CREATE POLICY "support_messages_select_own" ON "public"."support_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "support_messages"."athlete_id") AND ("a"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."sync_diagnostics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."terra_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "terra_connections_no_delete" ON "public"."terra_connections" FOR DELETE USING (false);



CREATE POLICY "terra_connections_no_insert" ON "public"."terra_connections" FOR INSERT WITH CHECK (false);



CREATE POLICY "terra_connections_no_update" ON "public"."terra_connections" FOR UPDATE USING (false);



CREATE POLICY "terra_connections_select_own" ON "public"."terra_connections" FOR SELECT USING ((("auth"."uid"() = "athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "terra_connections"."athlete_id") AND ("a"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."waitlist" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "waitlist_anon_insert" ON "public"."waitlist" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "wcb_select_own" ON "public"."weekly_consistency_bonuses" FOR SELECT USING (("athlete_id" = ( SELECT "athletes"."id"
   FROM "public"."athletes"
  WHERE ("athletes"."user_id" = "auth"."uid"())
 LIMIT 1)));



ALTER TABLE "public"."weekly_consistency_bonuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."whoop_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "whoop_connections_delete_own" ON "public"."whoop_connections" FOR DELETE USING ((("auth"."uid"() = "athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "whoop_connections"."athlete_id") AND ("a"."user_id" = "auth"."uid"()))))));



CREATE POLICY "whoop_connections_no_insert" ON "public"."whoop_connections" FOR INSERT WITH CHECK (false);



CREATE POLICY "whoop_connections_no_update" ON "public"."whoop_connections" FOR UPDATE USING (false);



CREATE POLICY "whoop_connections_select_own" ON "public"."whoop_connections" FOR SELECT USING ((("auth"."uid"() = "athlete_id") OR (EXISTS ( SELECT 1
   FROM "public"."athletes" "a"
  WHERE (("a"."id" = "whoop_connections"."athlete_id") AND ("a"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."workouts" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_member_to_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_invite_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_member_to_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_invite_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_member_to_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_member_to_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_invite_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_assert_caller"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_assert_caller"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_assert_caller"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_assert_caller"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_athlete_wearable_summary"("p_athlete_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_athlete_wearable_summary"("p_athlete_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_athlete_wearable_summary"("p_athlete_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_athlete_wearable_summary"("p_athlete_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_athlete_season_scores"("p_athlete_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_athlete_season_scores"("p_athlete_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_athlete_season_scores"("p_athlete_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_athlete_season_scores"("p_athlete_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_dashboard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_dashboard"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_dashboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_dashboard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_is_caller_allowed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_is_caller_allowed"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_is_caller_allowed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_is_caller_allowed"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_athlete_recent_activity"("p_athlete_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_athlete_recent_activity"("p_athlete_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_athlete_recent_activity"("p_athlete_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_athlete_recent_activity"("p_athlete_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_recent_rejected_activity"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_recent_rejected_activity"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_list_recent_rejected_activity"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_recent_rejected_activity"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."athlete_season_league_workout_count"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."athlete_season_league_workout_count"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."athlete_season_league_workout_count"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."athletes_ensure_open_divisions_trg"() TO "anon";
GRANT ALL ON FUNCTION "public"."athletes_ensure_open_divisions_trg"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."athletes_ensure_open_divisions_trg"() TO "service_role";



GRANT ALL ON FUNCTION "public"."award_weekly_consistency_bonus"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league" "text", "p_week_start" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."award_weekly_consistency_bonus"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league" "text", "p_week_start" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_weekly_consistency_bonus"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league" "text", "p_week_start" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."award_weekly_consistency_bonuses_for_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."award_weekly_consistency_bonuses_for_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_weekly_consistency_bonuses_for_all"() TO "service_role";



GRANT ALL ON FUNCTION "public"."award_weekly_consistency_bonuses_for_season"("p_season_id" "uuid", "p_week_start" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."award_weekly_consistency_bonuses_for_season"("p_season_id" "uuid", "p_week_start" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_weekly_consistency_bonuses_for_season"("p_season_id" "uuid", "p_week_start" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_activity_score"("p_league_type" "text", "p_duration_minutes" numeric, "p_avg_hr_percent" numeric, "p_avg_pace_seconds" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_activity_score"("p_league_type" "text", "p_duration_minutes" numeric, "p_avg_hr_percent" numeric, "p_avg_pace_seconds" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_activity_score"("p_league_type" "text", "p_duration_minutes" numeric, "p_avg_hr_percent" numeric, "p_avg_pace_seconds" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."caller_is_private_league_member"("p_league_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."caller_is_private_league_member"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."caller_is_private_league_member"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."caller_is_private_league_member"("p_league_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."caller_private_league_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."caller_private_league_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."caller_private_league_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."caller_private_league_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."category_leaderboard_rank"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_category" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."category_leaderboard_rank"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_category" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."category_leaderboard_rank"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_category" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_season_promotions"("p_season_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_season_promotions"("p_season_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_season_promotions"("p_season_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."consistency_bonus_points"("p_league" "text", "p_qualifying_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consistency_bonus_points"("p_league" "text", "p_qualifying_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consistency_bonus_points"("p_league" "text", "p_qualifying_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean, "p_image_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean, "p_image_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean, "p_image_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean, "p_image_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean, "p_image_url" "text", "p_gender" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean, "p_image_url" "text", "p_gender" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean, "p_image_url" "text", "p_gender" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_private_club"("p_athlete_id" "uuid", "p_name" "text", "p_league_type" "text", "p_is_public" boolean, "p_image_url" "text", "p_gender" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_athlete_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_athlete_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_athlete_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_athlete_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_private_league"("p_league_id" "uuid", "p_athlete_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_private_league"("p_league_id" "uuid", "p_athlete_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_private_league"("p_league_id" "uuid", "p_athlete_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."engine_league_session_score"("p_hr_percent" numeric, "p_duration_minutes" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."engine_league_session_score"("p_hr_percent" numeric, "p_duration_minutes" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."engine_league_session_score"("p_hr_percent" numeric, "p_duration_minutes" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."engine_points_per_minute"("p_hr_pct" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."engine_points_per_minute"("p_hr_pct" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."engine_points_per_minute"("p_hr_pct" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."engine_ppm_from_hr_percent"("p_hr_percent" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."engine_ppm_from_hr_percent"("p_hr_percent" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."engine_ppm_from_hr_percent"("p_hr_percent" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_athlete_open_divisions"("p_athlete_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_athlete_open_divisions"("p_athlete_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_athlete_open_divisions"("p_athlete_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_athlete_open_divisions"("p_athlete_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_athlete_user_id"("p_athlete_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ensure_athlete_user_id"("p_athlete_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_athlete_user_id"("p_athlete_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_athlete_user_id"("p_athlete_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_season"("p_season_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_season"("p_season_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_season"("p_season_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_season"("p_season_id" "uuid", "p_dry_run" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_season"("p_season_id" "uuid", "p_dry_run" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_season"("p_season_id" "uuid", "p_dry_run" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."fire_scoring_push_notifications"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league_type" "text", "p_score" numeric, "p_old_rank" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fire_scoring_push_notifications"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league_type" "text", "p_score" numeric, "p_old_rank" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fire_scoring_push_notifications"("p_athlete_id" "uuid", "p_season_id" "uuid", "p_league_type" "text", "p_score" numeric, "p_old_rank" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_club_by_conversation"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_club_by_conversation"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_club_by_conversation"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_club_by_conversation"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_dm_conversation"("p_my_athlete_id" "uuid", "p_friend_athlete_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_dm_conversation"("p_my_athlete_id" "uuid", "p_friend_athlete_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_dm_conversation"("p_my_athlete_id" "uuid", "p_friend_athlete_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_dm_conversation"("p_my_athlete_id" "uuid", "p_friend_athlete_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_private_league"("p_league_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_private_league"("p_league_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_private_league"("p_league_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_private_league"("p_league_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_private_league_for_join"("p_invite_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_private_league_for_join"("p_invite_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_private_league_for_join"("p_invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_private_league_for_join"("p_invite_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."invoke_push_notification"("p_edge_function" "text", "p_body" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_push_notification"("p_edge_function" "text", "p_body" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_push_notification"("p_edge_function" "text", "p_body" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."invoke_whoop_token_refresh"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invoke_whoop_token_refresh"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_whoop_token_refresh"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_whoop_token_refresh"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_allowlisted_athlete_for_caller"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_allowlisted_athlete_for_caller"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_allowlisted_athlete_for_caller"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_allowlisted_athlete_for_caller"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_conversation_members"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_conversation_members"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_conversation_members"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_conversation_members"("p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."list_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_conversation_messages"("p_conversation_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_dm_inbox"("p_athlete_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_dm_inbox"("p_athlete_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_dm_inbox"("p_athlete_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_dm_inbox"("p_athlete_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_group_inbox"("p_athlete_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_group_inbox"("p_athlete_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_group_inbox"("p_athlete_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_group_inbox"("p_athlete_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."london_today"() TO "anon";
GRANT ALL ON FUNCTION "public"."london_today"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."london_today"() TO "service_role";



GRANT ALL ON FUNCTION "public"."london_week_start"("p_ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."london_week_start"("p_ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."london_week_start"("p_ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."on_activity_inserted"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_activity_inserted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_activity_inserted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_conversation_message_inserted"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_conversation_message_inserted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_conversation_message_inserted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."on_friendship_inserted"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_friendship_inserted"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_friendship_inserted"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_activity"("payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."process_activity"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_activity"("payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_athlete_divisions_for_season"("p_season_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_athlete_divisions_for_season"("p_season_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reconcile_athlete_divisions_for_season"("p_season_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_athlete_divisions_for_season"("p_season_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reconcile_daily_workout_league_cap"("p_athlete_id" "uuid", "p_day" "date", "p_score_column" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reconcile_daily_workout_league_cap"("p_athlete_id" "uuid", "p_day" "date", "p_score_column" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_daily_workout_league_cap"("p_athlete_id" "uuid", "p_day" "date", "p_score_column" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_membership_season_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_membership_season_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_membership_season_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_membership_season_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_next_season_id"("p_ending_season_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_next_season_id"("p_ending_season_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_next_season_id"("p_ending_season_id" "uuid") TO "service_role";






GRANT ALL ON FUNCTION "public"."run_league_session_score"("p_pace_seconds" numeric, "p_duration_minutes" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."run_league_session_score"("p_pace_seconds" numeric, "p_duration_minutes" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_league_session_score"("p_pace_seconds" numeric, "p_duration_minutes" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."run_ppm_from_pace"("p_pace_seconds" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."run_ppm_from_pace"("p_pace_seconds" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_ppm_from_pace"("p_pace_seconds" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."season_id_for_london_week"("p_week_start" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."season_id_for_london_week"("p_week_start" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."season_id_for_london_week"("p_week_start" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_athlete_id" "uuid", "p_content" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_athlete_id" "uuid", "p_content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_athlete_id" "uuid", "p_content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_conversation_message"("p_conversation_id" "uuid", "p_athlete_id" "uuid", "p_content" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."session_counts_for_consistency_bonus"("p_session_score" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."session_counts_for_consistency_bonus"("p_session_score" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."session_counts_for_consistency_bonus"("p_session_score" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."session_duration_qualifies_for_scoring"("p_duration_minutes" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."session_duration_qualifies_for_scoring"("p_duration_minutes" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."session_duration_qualifies_for_scoring"("p_duration_minutes" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_apple_workouts"("p_athlete_id" "uuid", "p_workouts" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_apple_workouts"("p_athlete_id" "uuid", "p_workouts" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_apple_workouts"("p_athlete_id" "uuid", "p_workouts" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_apple_workouts"("p_athlete_id" "uuid", "p_workouts" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text", "p_image_url" "text", "p_is_public" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text", "p_image_url" "text", "p_is_public" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text", "p_image_url" "text", "p_is_public" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text", "p_image_url" "text", "p_is_public" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text", "p_image_url" "text", "p_is_public" boolean, "p_gender" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text", "p_image_url" "text", "p_is_public" boolean, "p_gender" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text", "p_image_url" "text", "p_is_public" boolean, "p_gender" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_private_club"("p_league_id" "uuid", "p_athlete_id" "uuid", "p_name" "text", "p_image_url" "text", "p_is_public" boolean, "p_gender" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."user_is_conversation_member"("p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_is_conversation_member"("p_conversation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_is_conversation_member"("p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_is_conversation_member"("p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_achievements" TO "anon";
GRANT ALL ON TABLE "public"."athlete_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_achievements" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_divisions" TO "anon";
GRANT ALL ON TABLE "public"."athlete_divisions" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_divisions" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_friend_rank_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."athlete_friend_rank_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_friend_rank_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."athlete_stats" TO "anon";
GRANT ALL ON TABLE "public"."athlete_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."athlete_stats" TO "service_role";



GRANT ALL ON TABLE "public"."athletes" TO "anon";
GRANT ALL ON TABLE "public"."athletes" TO "authenticated";
GRANT ALL ON TABLE "public"."athletes" TO "service_role";



GRANT ALL ON TABLE "public"."consistency_bonus_tiers" TO "anon";
GRANT ALL ON TABLE "public"."consistency_bonus_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."consistency_bonus_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_members" TO "anon";
GRANT ALL ON TABLE "public"."conversation_members" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_members" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_messages" TO "anon";
GRANT ALL ON TABLE "public"."conversation_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_messages" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."direct_messages" TO "anon";
GRANT ALL ON TABLE "public"."direct_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_messages" TO "service_role";



GRANT ALL ON TABLE "public"."division_rules" TO "anon";
GRANT ALL ON TABLE "public"."division_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."division_rules" TO "service_role";



GRANT ALL ON TABLE "public"."engine_ppm_lookup" TO "anon";
GRANT ALL ON TABLE "public"."engine_ppm_lookup" TO "authenticated";
GRANT ALL ON TABLE "public"."engine_ppm_lookup" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."lifetime_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."lifetime_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."lifetime_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."private_league_members" TO "anon";
GRANT ALL ON TABLE "public"."private_league_members" TO "authenticated";
GRANT ALL ON TABLE "public"."private_league_members" TO "service_role";



GRANT ALL ON TABLE "public"."private_leagues" TO "anon";
GRANT ALL ON TABLE "public"."private_leagues" TO "authenticated";
GRANT ALL ON TABLE "public"."private_leagues" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_history" TO "anon";
GRANT ALL ON TABLE "public"."promotion_history" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_history" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_settings" TO "anon";
GRANT ALL ON TABLE "public"."promotion_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_settings" TO "service_role";



GRANT ALL ON TABLE "public"."run_ppm_lookup" TO "anon";
GRANT ALL ON TABLE "public"."run_ppm_lookup" TO "authenticated";
GRANT ALL ON TABLE "public"."run_ppm_lookup" TO "service_role";



GRANT ALL ON TABLE "public"."season_division_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."season_division_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."season_division_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."season_overall_leaderboard" TO "anon";
GRANT ALL ON TABLE "public"."season_overall_leaderboard" TO "authenticated";
GRANT ALL ON TABLE "public"."season_overall_leaderboard" TO "service_role";



GRANT ALL ON TABLE "public"."season_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."season_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."season_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."seasons" TO "anon";
GRANT ALL ON TABLE "public"."seasons" TO "authenticated";
GRANT ALL ON TABLE "public"."seasons" TO "service_role";



GRANT ALL ON TABLE "public"."support_messages" TO "anon";
GRANT ALL ON TABLE "public"."support_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."support_messages" TO "service_role";



GRANT ALL ON TABLE "public"."sync_diagnostics" TO "anon";
GRANT ALL ON TABLE "public"."sync_diagnostics" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_diagnostics" TO "service_role";



GRANT ALL ON TABLE "public"."terra_connections" TO "anon";
GRANT ALL ON TABLE "public"."terra_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."terra_connections" TO "service_role";



GRANT ALL ON TABLE "public"."waitlist" TO "anon";
GRANT ALL ON TABLE "public"."waitlist" TO "authenticated";
GRANT ALL ON TABLE "public"."waitlist" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_consistency_bonuses" TO "anon";
GRANT ALL ON TABLE "public"."weekly_consistency_bonuses" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_consistency_bonuses" TO "service_role";



GRANT ALL ON TABLE "public"."whoop_connections" TO "anon";
GRANT ALL ON TABLE "public"."whoop_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."whoop_connections" TO "service_role";



GRANT ALL ON TABLE "public"."workouts" TO "anon";
GRANT ALL ON TABLE "public"."workouts" TO "authenticated";
GRANT ALL ON TABLE "public"."workouts" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







