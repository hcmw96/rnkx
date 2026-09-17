-- Keep inbox delivery on the support_messages row so current app inserts
-- (and submit_support_message) both reach Shaun without double-posting.

create or replace function public.deliver_support_message_to_inbox(
  p_athlete_id uuid,
  p_body text,
  p_created_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_support uuid;
  v_cid uuid;
  v_label text;
begin
  v_support := public.support_inbox_athlete_id();
  if v_support is null or p_athlete_id is null or p_athlete_id = v_support then
    return null;
  end if;

  select c.id into v_cid
  from public.conversations c
  where c.is_group = false
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.athlete_id = p_athlete_id
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
    values (false, coalesce(v_label, 'Chat'), p_athlete_id)
    returning id into v_cid;

    insert into public.conversation_members (conversation_id, athlete_id)
    values (v_cid, p_athlete_id), (v_cid, v_support);
  end if;

  if not exists (
    select 1
    from public.conversation_messages m
    where m.conversation_id = v_cid
      and m.athlete_id = p_athlete_id
      and m.content = p_body
      and abs(extract(epoch from (m.created_at - p_created_at))) < 2
  ) then
    insert into public.conversation_messages (conversation_id, athlete_id, content, created_at)
    values (v_cid, p_athlete_id, p_body, coalesce(p_created_at, now()));
  end if;

  return v_cid;
end;
$$;

create or replace function public.on_support_message_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.deliver_support_message_to_inbox(new.athlete_id, new.body, new.created_at);
  return new;
exception
  when others then
    raise warning 'on_support_message_inserted: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists support_messages_to_inbox on public.support_messages;
create trigger support_messages_to_inbox
  after insert on public.support_messages
  for each row
  execute function public.on_support_message_inserted();

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
  v_cid uuid;
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

  v_cid := public.deliver_support_message_to_inbox(p_athlete_id, v_text, now());

  return jsonb_build_object(
    'ok', true,
    'delivered_to_inbox', v_cid is not null,
    'conversation_id', v_cid
  );
end;
$$;
