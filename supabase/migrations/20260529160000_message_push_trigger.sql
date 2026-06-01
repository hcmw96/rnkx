-- Reliable message push: fire notify-new-message from DB on insert (not only client invoke).

create or replace function public.on_conversation_message_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists conversation_messages_push on public.conversation_messages;

create trigger conversation_messages_push
  after insert on public.conversation_messages
  for each row
  execute function public.on_conversation_message_inserted();
