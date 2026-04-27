-- Activities: status for league feeds (terra/whoop inserts may omit; default scored)
alter table public.activities add column if not exists status text not null default 'scored';

-- Group chat + private leagues + friendships
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default true,
  name text not null,
  created_by uuid not null references public.athletes (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  primary key (conversation_id, athlete_id)
);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists conversation_messages_conversation_id_idx
  on public.conversation_messages (conversation_id);

create table if not exists public.private_leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  league_type text not null check (league_type in ('engine', 'run')),
  created_by uuid not null references public.athletes (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.private_league_members (
  league_id uuid not null references public.private_leagues (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (league_id, athlete_id)
);

create index if not exists private_league_members_athlete_id_idx on public.private_league_members (athlete_id);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  friend_id uuid not null references public.athletes (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint friendships_no_self check (athlete_id <> friend_id),
  constraint friendships_pair_unique unique (athlete_id, friend_id)
);

create index if not exists friendships_friend_id_idx on public.friendships (friend_id);

-- Enable Realtime for conversation_messages in Supabase Dashboard (Database → Replication) if needed.

-- RLS
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.private_leagues enable row level security;
alter table public.private_league_members enable row level security;
alter table public.friendships enable row level security;

-- Helper: athlete row for auth.uid()
-- Policies use exists(subquery joining athletes.user_id = auth.uid())

drop policy if exists "conversations_select_member" on public.conversations;
drop policy if exists "conversations_insert_creator" on public.conversations;
drop policy if exists "conversation_members_select" on public.conversation_members;
drop policy if exists "conversation_members_insert_self" on public.conversation_members;
drop policy if exists "conversation_messages_select" on public.conversation_messages;
drop policy if exists "conversation_messages_insert_self" on public.conversation_messages;
drop policy if exists "private_leagues_select_member" on public.private_leagues;
drop policy if exists "private_leagues_insert" on public.private_leagues;
drop policy if exists "private_leagues_update_creator" on public.private_leagues;
drop policy if exists "private_league_members_select" on public.private_league_members;
drop policy if exists "private_league_members_insert" on public.private_league_members;
drop policy if exists "private_league_members_update" on public.private_league_members;
drop policy if exists "friendships_select" on public.friendships;
drop policy if exists "friendships_insert" on public.friendships;
drop policy if exists "friendships_update" on public.friendships;

create policy "conversations_select_member"
  on public.conversations for select using (
    exists (
      select 1 from public.conversation_members cm
      join public.athletes a on a.id = cm.athlete_id
      where cm.conversation_id = conversations.id and a.user_id = auth.uid()
    )
    or exists (select 1 from public.athletes ac where ac.id = conversations.created_by and ac.user_id = auth.uid())
  );

create policy "conversations_insert_creator"
  on public.conversations for insert with check (
    exists (select 1 from public.athletes ac where ac.id = conversations.created_by and ac.user_id = auth.uid())
  );

create policy "conversation_members_select"
  on public.conversation_members for select using (
    exists (select 1 from public.athletes a where a.id = conversation_members.athlete_id and a.user_id = auth.uid())
    or exists (
      select 1 from public.conversation_members cm2
      join public.athletes a2 on a2.id = cm2.athlete_id
      where cm2.conversation_id = conversation_members.conversation_id and a2.user_id = auth.uid()
    )
  );

create policy "conversation_members_insert_self"
  on public.conversation_members for insert with check (
    exists (select 1 from public.athletes a where a.id = conversation_members.athlete_id and a.user_id = auth.uid())
  );

-- League creator can add other athletes to the league's group chat
create policy "conversation_members_insert_league_creator"
  on public.conversation_members for insert with check (
    exists (
      select 1 from public.private_leagues pl
      join public.athletes ac on ac.id = pl.created_by
      where pl.conversation_id = conversation_members.conversation_id and ac.user_id = auth.uid()
    )
  );

create policy "conversation_messages_select"
  on public.conversation_messages for select using (
    exists (
      select 1 from public.conversation_members cm
      join public.athletes a on a.id = cm.athlete_id
      where cm.conversation_id = conversation_messages.conversation_id and a.user_id = auth.uid()
    )
  );

create policy "conversation_messages_insert_self"
  on public.conversation_messages for insert with check (
    exists (select 1 from public.athletes a where a.id = conversation_messages.athlete_id and a.user_id = auth.uid())
  );

create policy "private_leagues_select_member"
  on public.private_leagues for select using (
    exists (select 1 from public.athletes ac where ac.id = private_leagues.created_by and ac.user_id = auth.uid())
    or exists (
      select 1 from public.private_league_members plm
      join public.athletes a on a.id = plm.athlete_id
      where plm.league_id = private_leagues.id and a.user_id = auth.uid()
    )
  );

create policy "private_leagues_insert"
  on public.private_leagues for insert with check (
    exists (select 1 from public.athletes a where a.id = private_leagues.created_by and a.user_id = auth.uid())
  );

create policy "private_leagues_update_creator"
  on public.private_leagues for update using (
    exists (select 1 from public.athletes a where a.id = private_leagues.created_by and a.user_id = auth.uid())
  );

create policy "private_league_members_select"
  on public.private_league_members for select using (
    exists (select 1 from public.athletes a where a.id = private_league_members.athlete_id and a.user_id = auth.uid())
    or exists (
      select 1 from public.private_league_members plm2
      join public.athletes a2 on a2.id = plm2.athlete_id
      where plm2.league_id = private_league_members.league_id and a2.user_id = auth.uid()
    )
  );

create policy "private_league_members_insert"
  on public.private_league_members for insert with check (
    exists (select 1 from public.athletes a where a.id = private_league_members.athlete_id and a.user_id = auth.uid())
    or exists (
      select 1 from public.private_leagues pl
      join public.athletes ac on ac.id = pl.created_by
      where pl.id = private_league_members.league_id and ac.user_id = auth.uid()
    )
  );

create policy "private_league_members_update"
  on public.private_league_members for update using (
    exists (select 1 from public.athletes a where a.id = private_league_members.athlete_id and a.user_id = auth.uid())
    or exists (
      select 1 from public.private_leagues pl
      join public.athletes ac on ac.id = pl.created_by
      where pl.id = private_league_members.league_id and ac.user_id = auth.uid()
    )
  );

create policy "friendships_select"
  on public.friendships for select using (
    exists (select 1 from public.athletes a where a.id = friendships.athlete_id and a.user_id = auth.uid())
    or exists (select 1 from public.athletes a where a.id = friendships.friend_id and a.user_id = auth.uid())
  );

create policy "friendships_insert"
  on public.friendships for insert with check (
    exists (select 1 from public.athletes a where a.id = friendships.athlete_id and a.user_id = auth.uid())
  );

create policy "friendships_update"
  on public.friendships for update using (
    exists (select 1 from public.athletes a where a.id = friendships.friend_id and a.user_id = auth.uid())
    or exists (select 1 from public.athletes a where a.id = friendships.athlete_id and a.user_id = auth.uid())
  );
