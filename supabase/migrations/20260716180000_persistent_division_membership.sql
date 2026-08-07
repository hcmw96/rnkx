-- Persistent division membership + editable promo rules + history/snapshots
-- Does NOT implement season-reset job; only schema, seed, backfill, RLS.

create extension if not exists pgcrypto;

-- One active season only (prevents silent dual-active)
create unique index if not exists seasons_one_active_idx
  on public.seasons (is_active)
  where is_active;

-- ---------------------------------------------------------------------------
-- updated_at helper (shared)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Editable promotion / relegation rules (admin dashboard)
-- ---------------------------------------------------------------------------
create table if not exists public.division_rules (
  division text primary key
    check (division in ('Open', 'Challenger', 'Pro', 'Elite')),
  promote_percent numeric(5, 2)
    check (promote_percent is null or (promote_percent >= 0 and promote_percent <= 100)),
  promote_min_count integer
    check (promote_min_count is null or promote_min_count >= 0),
  relegate_percent numeric(5, 2)
    check (relegate_percent is null or (relegate_percent >= 0 and relegate_percent <= 100)),
  promotes_to text
    references public.division_rules (division),
  relegates_to text
    references public.division_rules (division),
  updated_at timestamptz not null default now(),
  constraint division_rules_no_self_promote check (promotes_to is distinct from division),
  constraint division_rules_no_self_relegate check (relegates_to is distinct from division)
);

drop trigger if exists division_rules_set_updated_at on public.division_rules;
create trigger division_rules_set_updated_at
  before update on public.division_rules
  for each row
  execute function public.set_updated_at();

insert into public.division_rules
  (division, promote_percent, promote_min_count, relegate_percent, promotes_to, relegates_to)
values
  ('Open',       20.00, 10,   null,  'Challenger', null),
  ('Challenger', 15.00, null, 15.00, 'Pro',        'Open'),
  ('Pro',        10.00, null, 15.00, 'Elite',      'Challenger'),
  ('Elite',      null,  null, 20.00, null,         'Pro')
on conflict (division) do update set
  promote_percent   = excluded.promote_percent,
  promote_min_count = excluded.promote_min_count,
  relegate_percent  = excluded.relegate_percent,
  promotes_to       = excluded.promotes_to,
  relegates_to      = excluded.relegates_to,
  updated_at        = now();

-- Global promo knobs (alongside division_rules; admin-editable)
create table if not exists public.promotion_settings (
  id boolean primary key default true check (id),
  min_workouts_for_promotion integer not null default 3
    check (min_workouts_for_promotion >= 0),
  updated_at timestamptz not null default now()
);

drop trigger if exists promotion_settings_set_updated_at on public.promotion_settings;
create trigger promotion_settings_set_updated_at
  before update on public.promotion_settings
  for each row
  execute function public.set_updated_at();

insert into public.promotion_settings (id, min_workouts_for_promotion)
values (true, 3)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Current / per-season membership (source of truth)
-- ---------------------------------------------------------------------------
create table if not exists public.athlete_divisions (
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  season_id  uuid not null references public.seasons (id) on delete cascade,
  league     text not null check (league in ('engine', 'run')),
  division   text not null references public.division_rules (division),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, season_id, league)
);

create index if not exists athlete_divisions_season_league_division_idx
  on public.athlete_divisions (season_id, league, division);

create index if not exists athlete_divisions_athlete_season_idx
  on public.athlete_divisions (athlete_id, season_id);

drop trigger if exists athlete_divisions_set_updated_at on public.athlete_divisions;
create trigger athlete_divisions_set_updated_at
  before update on public.athlete_divisions
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) Permanent promotion / relegation timeline (never cleared on reset)
-- ---------------------------------------------------------------------------
create table if not exists public.promotion_history (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.athletes (id) on delete cascade,
  season_id     uuid not null references public.seasons (id) on delete restrict,
  league        text not null check (league in ('engine', 'run')),
  from_division text not null references public.division_rules (division),
  to_division   text not null references public.division_rules (division),
  result        text not null check (result in ('promoted', 'relegated', 'held')),
  final_rank    integer not null check (final_rank > 0),
  final_points  numeric not null,
  created_at    timestamptz not null default now()
);

create index if not exists promotion_history_athlete_created_idx
  on public.promotion_history (athlete_id, created_at desc);

create index if not exists promotion_history_season_league_idx
  on public.promotion_history (season_id, league);

-- ---------------------------------------------------------------------------
-- 4) Final standings at reset, BEFORE promo/rel is applied
-- ---------------------------------------------------------------------------
create table if not exists public.season_snapshots (
  id         uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  season_id  uuid not null references public.seasons (id) on delete restrict,
  league     text not null check (league in ('engine', 'run')),
  division   text not null references public.division_rules (division),
  rank       integer not null check (rank > 0),
  points     numeric not null,
  created_at timestamptz not null default now(),
  unique (athlete_id, season_id, league)
);

create index if not exists season_snapshots_season_league_rank_idx
  on public.season_snapshots (season_id, league, rank);

create index if not exists season_snapshots_athlete_idx
  on public.season_snapshots (athlete_id);

-- ---------------------------------------------------------------------------
-- Membership helpers: active → upcoming fallback; reconcile on season start
-- ---------------------------------------------------------------------------

-- Target season for new membership:
--   1) the (unique) active season, else
--   2) next upcoming: not active, starts_at > now(), earliest starts_at
create or replace function public.resolve_membership_season_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
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

create or replace function public.ensure_athlete_open_divisions(p_athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

-- Call from season-start routine after flipping is_active.
-- Inserts Open×engine + Open×run for every athlete missing a row for p_season_id.
-- Returns number of rows inserted.
create or replace function public.reconcile_athlete_divisions_for_season(p_season_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.athletes_ensure_open_divisions_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_athlete_open_divisions(new.id);
  return new;
end;
$$;

drop trigger if exists athletes_ensure_open_divisions on public.athletes;
create trigger athletes_ensure_open_divisions
  after insert on public.athletes
  for each row
  execute function public.athletes_ensure_open_divisions_trg();

-- Backfill: membership for active, else upcoming (same resolver as signup)
do $$
declare
  v_season_id uuid;
begin
  v_season_id := public.resolve_membership_season_id();

  if v_season_id is null then
    raise notice 'No active or upcoming season; skipped athlete_divisions backfill';
    return;
  end if;

  perform public.reconcile_athlete_divisions_for_season(v_season_id);
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- Own-row checks use athletes.user_id only (column verified on live schema)
-- ---------------------------------------------------------------------------
alter table public.division_rules enable row level security;
alter table public.promotion_settings enable row level security;
alter table public.athlete_divisions enable row level security;
alter table public.promotion_history enable row level security;
alter table public.season_snapshots enable row level security;

-- division_rules: public read; admin write
drop policy if exists division_rules_admin_select on public.division_rules;
drop policy if exists division_rules_select_public on public.division_rules;
create policy division_rules_select_public
  on public.division_rules for select
  using (true);

drop policy if exists division_rules_admin_insert on public.division_rules;
create policy division_rules_admin_insert
  on public.division_rules for insert
  with check (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists division_rules_admin_update on public.division_rules;
create policy division_rules_admin_update
  on public.division_rules for update
  using (coalesce(public.admin_is_caller_allowed(), false))
  with check (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists division_rules_admin_delete on public.division_rules;
create policy division_rules_admin_delete
  on public.division_rules for delete
  using (coalesce(public.admin_is_caller_allowed(), false));

-- promotion_settings: public read; admin write
drop policy if exists promotion_settings_select_public on public.promotion_settings;
create policy promotion_settings_select_public
  on public.promotion_settings for select
  using (true);

drop policy if exists promotion_settings_admin_insert on public.promotion_settings;
create policy promotion_settings_admin_insert
  on public.promotion_settings for insert
  with check (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists promotion_settings_admin_update on public.promotion_settings;
create policy promotion_settings_admin_update
  on public.promotion_settings for update
  using (coalesce(public.admin_is_caller_allowed(), false))
  with check (coalesce(public.admin_is_caller_allowed(), false));

drop policy if exists promotion_settings_admin_delete on public.promotion_settings;
create policy promotion_settings_admin_delete
  on public.promotion_settings for delete
  using (coalesce(public.admin_is_caller_allowed(), false));

-- athlete_divisions: public select on CURRENT season (leaderboard); own for all seasons
drop policy if exists athlete_divisions_select_own on public.athlete_divisions;
create policy athlete_divisions_select_own
  on public.athlete_divisions for select
  using (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.user_id = auth.uid()
    )
  );

drop policy if exists athlete_divisions_select_current_season on public.athlete_divisions;
create policy athlete_divisions_select_current_season
  on public.athlete_divisions for select
  using (
    exists (
      select 1 from public.seasons s
      where s.id = season_id and s.is_active
    )
  );

-- promotion_history: athletes read own; never client-writable
drop policy if exists promotion_history_select_own on public.promotion_history;
create policy promotion_history_select_own
  on public.promotion_history for select
  using (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.user_id = auth.uid()
    )
  );

-- season_snapshots: athletes read own; never client-writable
drop policy if exists season_snapshots_select_own on public.season_snapshots;
create policy season_snapshots_select_own
  on public.season_snapshots for select
  using (
    exists (
      select 1 from public.athletes a
      where a.id = athlete_id and a.user_id = auth.uid()
    )
  );

revoke all on function public.resolve_membership_season_id() from public;
revoke all on function public.ensure_athlete_open_divisions(uuid) from public;
revoke all on function public.reconcile_athlete_divisions_for_season(uuid) from public;

grant execute on function public.resolve_membership_season_id() to service_role;
grant execute on function public.ensure_athlete_open_divisions(uuid) to service_role;
grant execute on function public.reconcile_athlete_divisions_for_season(uuid) to service_role;
