-- Align conversation_messages column (body vs content), fix athlete↔auth linking, refresh chat RPCs.

-- 1) Single text column named content (repo originally used body; some remotes renamed manually).
do $migrate$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_messages'
      and column_name = 'body'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_messages'
      and column_name = 'content'
  ) then
    alter table public.conversation_messages rename column body to content;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_messages'
      and column_name = 'body'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_messages'
      and column_name = 'content'
  ) then
    update public.conversation_messages
    set content = coalesce(nullif(trim(content), ''), body)
    where body is not null and (content is null or trim(content) = '');

    alter table public.conversation_messages drop column body;
  end if;
end
$migrate$;

-- 2) Backfill athletes.user_id for legacy rows (id matched auth user at signup).
update public.athletes a
set user_id = a.id
where a.user_id is null
  and exists (select 1 from auth.users u where u.id = a.id);

-- 3) ensure_athlete_user_id: actually link row used by chat/clubs.
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
    and user_id is null
    and (
      id = auth.uid()
      or exists (select 1 from auth.users u where u.id = p_athlete_id)
    );
end;
$$;

revoke all on function public.ensure_athlete_user_id(uuid) from public;
grant execute on function public.ensure_athlete_user_id(uuid) to authenticated;

-- 4) Chat RPCs (content column, return content not body).
create or replace function public.list_conversation_messages(
  p_conversation_id uuid,
  p_limit int default 200
)
returns table (
  id uuid,
  athlete_id uuid,
  content text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.list_conversation_messages(uuid, int) from public;
grant execute on function public.list_conversation_messages(uuid, int) to authenticated;

create or replace function public.send_conversation_message(
  p_conversation_id uuid,
  p_athlete_id uuid,
  p_content text
)
returns table (
  id uuid,
  athlete_id uuid,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.send_conversation_message(uuid, uuid, text) from public;
grant execute on function public.send_conversation_message(uuid, uuid, text) to authenticated;
