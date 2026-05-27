-- Include conversation_id in DM inbox rows so clients can track unread by thread.

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

