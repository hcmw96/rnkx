-- Unified group chat inbox (security definer) + consolidate group message push to notify-new-message.

create or replace function public.list_group_inbox(p_athlete_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.last_message_at desc nulls last),
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
      coalesce(
        (
          select msg.created_at
          from public.conversation_messages msg
          where msg.conversation_id = c.id
          order by msg.created_at desc
          limit 1
        ),
        c.created_at
      ) as last_message_at,
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

revoke all on function public.list_group_inbox(uuid) from public;
grant execute on function public.list_group_inbox(uuid) to authenticated;

-- Drop legacy trigger that called notify-group-message with a hardcoded JWT (duplicate / brittle).
drop trigger if exists on_group_message_inserted on public.conversation_messages;
drop function if exists public.on_group_message_inserted();

-- Ensure message push trigger exists (notify-new-message via vault service role).
drop trigger if exists conversation_messages_push on public.conversation_messages;

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

create trigger conversation_messages_push
  after insert on public.conversation_messages
  for each row
  execute function public.on_conversation_message_inserted();

-- Backfill conversation_members for accepted club members (idempotent).
insert into public.conversation_members (conversation_id, athlete_id)
select pl.conversation_id, plm.athlete_id
from public.private_league_members plm
join public.private_leagues pl on pl.id = plm.league_id
where pl.conversation_id is not null
  and plm.status = 'accepted'
on conflict (conversation_id, athlete_id) do nothing;
