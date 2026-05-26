-- Chat fix: stop conversation_members RLS recursion + DM/message RPCs (run this on remote Supabase).

create or replace function public.ensure_athlete_user_id(p_athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.ensure_athlete_user_id(uuid) from public;
grant execute on function public.ensure_athlete_user_id(uuid) to authenticated;

create or replace function public.user_is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    join public.athletes a on a.id = cm.athlete_id
    where cm.conversation_id = p_conversation_id
      and a.user_id = auth.uid()
  );
$$;

revoke all on function public.user_is_conversation_member(uuid) from public;
grant execute on function public.user_is_conversation_member(uuid) to authenticated;

drop policy if exists "conversation_members_select" on public.conversation_members;
create policy "conversation_members_select"
  on public.conversation_members for select
  using (
    exists (
      select 1 from public.athletes a
      where a.id = conversation_members.athlete_id and a.user_id = auth.uid()
    )
    or public.user_is_conversation_member(conversation_members.conversation_id)
  );

drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member"
  on public.conversations for select
  using (
    public.user_is_conversation_member(conversations.id)
    or exists (
      select 1 from public.athletes ac
      where ac.id = conversations.created_by and ac.user_id = auth.uid()
    )
  );

drop policy if exists "conversation_messages_select" on public.conversation_messages;
create policy "conversation_messages_select"
  on public.conversation_messages for select
  using (public.user_is_conversation_member(conversation_messages.conversation_id));

-- Find or create 1:1 DM (bypasses broken member SELECT during setup).
create or replace function public.get_or_create_dm_conversation(
  p_my_athlete_id uuid,
  p_friend_athlete_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.get_or_create_dm_conversation(uuid, uuid) from public;
grant execute on function public.get_or_create_dm_conversation(uuid, uuid) to authenticated;

-- Load messages without hitting recursive RLS.
create or replace function public.list_conversation_messages(
  p_conversation_id uuid,
  p_limit int default 200
)
returns table (
  id uuid,
  athlete_id uuid,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.athlete_id, m.body, m.created_at
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

revoke all on function public.list_conversation_messages(uuid, int) from public;
grant execute on function public.list_conversation_messages(uuid, int) to authenticated;

-- Inbox: list DM threads for chat overview.
create or replace function public.list_dm_inbox(p_athlete_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.last_message_at desc nulls last),
  '[]'::jsonb)
  from (
    select
      friend_a.id as friend_id,
      friend_a.username as friend_username,
      friend_a.avatar_url as friend_avatar_url,
      (
        select msg.body
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
      ) as last_message_at
    from public.conversations c
    join public.conversation_members my_m on my_m.conversation_id = c.id and my_m.athlete_id = p_athlete_id
    join public.conversation_members friend_m on friend_m.conversation_id = c.id and friend_m.athlete_id <> p_athlete_id
    join public.athletes friend_a on friend_a.id = friend_m.athlete_id
    join public.athletes me on me.id = p_athlete_id and me.user_id = auth.uid()
    where c.is_group = false
      and (select count(*)::int from public.conversation_members x where x.conversation_id = c.id) = 2
  ) t;
$$;

revoke all on function public.list_dm_inbox(uuid) from public;
grant execute on function public.list_dm_inbox(uuid) to authenticated;
