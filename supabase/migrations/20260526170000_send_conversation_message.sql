-- Send + list messages using conversation_messages.content (not body).

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
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(p_content), '') is null then
    raise exception 'Message is empty';
  end if;

  perform public.ensure_athlete_user_id(p_athlete_id);

  if not exists (
    select 1
    from public.conversation_members cm
    join public.athletes a on a.id = cm.athlete_id
    where cm.conversation_id = p_conversation_id
      and cm.athlete_id = p_athlete_id
      and a.user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
  end if;

  insert into public.conversation_messages (conversation_id, athlete_id, content)
  values (p_conversation_id, p_athlete_id, trim(p_content))
  returning conversation_messages.id, conversation_messages.created_at
  into v_id, v_created;

  return query
  select v_id, p_athlete_id, trim(p_content), v_created;
end;
$$;

revoke all on function public.send_conversation_message(uuid, uuid, text) from public;
grant execute on function public.send_conversation_message(uuid, uuid, text) to authenticated;
