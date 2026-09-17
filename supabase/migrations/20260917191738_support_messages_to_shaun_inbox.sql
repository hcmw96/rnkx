-- Route Settings → Contact support into Shaun Smith's in-app DM inbox.

create or replace function public.support_inbox_athlete_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id
  from public.athletes a
  where lower(trim(a.username)) = 'shaunsmith'
  order by a.created_at asc
  limit 1;
$$;

revoke all on function public.support_inbox_athlete_id() from public;
grant execute on function public.support_inbox_athlete_id() to authenticated;

create or replace function public.submit_support_message(
  p_athlete_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text;
  v_support_id uuid;
  v_cid uuid;
  v_msg_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_text := trim(p_body);
  if v_text is null or v_text = '' then
    raise exception 'Message is empty';
  end if;

  if not exists (
    select 1
    from public.athletes a
    where a.id = p_athlete_id
      and (a.user_id = auth.uid() or a.id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;

  insert into public.support_messages (athlete_id, body)
  values (p_athlete_id, v_text);

  v_support_id := public.support_inbox_athlete_id();
  if v_support_id is null then
    return jsonb_build_object('ok', true, 'delivered_to_inbox', false);
  end if;

  if p_athlete_id = v_support_id then
    return jsonb_build_object('ok', true, 'delivered_to_inbox', false);
  end if;

  v_cid := public.get_or_create_dm_conversation(p_athlete_id, v_support_id);

  insert into public.conversation_messages (conversation_id, athlete_id, content)
  values (v_cid, p_athlete_id, v_text)
  returning id into v_msg_id;

  return jsonb_build_object(
    'ok', true,
    'delivered_to_inbox', true,
    'conversation_id', v_cid,
    'message_id', v_msg_id
  );
end;
$$;

revoke all on function public.submit_support_message(uuid, text) from public;
grant execute on function public.submit_support_message(uuid, text) to authenticated;

-- Deliver any support rows that never reached the inbox.
do $$
declare
  rec record;
  v_support uuid;
  v_cid uuid;
  v_label text;
begin
  select public.support_inbox_athlete_id() into v_support;
  if v_support is null then
    return;
  end if;

  for rec in
    select sm.athlete_id, sm.body, sm.created_at
    from public.support_messages sm
    where sm.athlete_id is distinct from v_support
    order by sm.created_at
  loop
    select c.id into v_cid
    from public.conversations c
    where c.is_group = false
      and exists (
        select 1 from public.conversation_members m
        where m.conversation_id = c.id and m.athlete_id = rec.athlete_id
      )
      and exists (
        select 1 from public.conversation_members m
        where m.conversation_id = c.id and m.athlete_id = v_support
      )
      and (select count(*)::int from public.conversation_members m where m.conversation_id = c.id) = 2
    limit 1;

    if v_cid is null then
      select coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), 'Chat')
      into v_label
      from public.athletes
      where id = v_support;

      insert into public.conversations (is_group, name, created_by)
      values (false, v_label, rec.athlete_id)
      returning id into v_cid;

      insert into public.conversation_members (conversation_id, athlete_id)
      values (v_cid, rec.athlete_id), (v_cid, v_support);
    end if;

    if not exists (
      select 1
      from public.conversation_messages m
      where m.conversation_id = v_cid
        and m.athlete_id = rec.athlete_id
        and m.content = rec.body
    ) then
      insert into public.conversation_messages (conversation_id, athlete_id, content, created_at)
      values (v_cid, rec.athlete_id, rec.body, rec.created_at);
    end if;
  end loop;
end;
$$;
