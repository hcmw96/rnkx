-- Group inbox: sort empty chats by club creation, but don't treat creation date as last message.

create or replace function public.list_group_inbox(p_athlete_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(row_to_json(t) order by t.sort_at desc nulls last),
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
      (
        select msg.created_at
        from public.conversation_messages msg
        where msg.conversation_id = c.id
        order by msg.created_at desc
        limit 1
      ) as last_message_at,
      coalesce(
        (
          select msg.created_at
          from public.conversation_messages msg
          where msg.conversation_id = c.id
          order by msg.created_at desc
          limit 1
        ),
        c.created_at
      ) as sort_at,
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
