-- Allow DM conversation creator to add an accepted friend to the thread.
drop policy if exists "conversation_members_insert_dm_friend" on public.conversation_members;

create policy "conversation_members_insert_dm_friend"
  on public.conversation_members for insert with check (
    exists (
      select 1
      from public.conversations c
      join public.athletes ac on ac.id = c.created_by
      where c.id = conversation_members.conversation_id
        and c.is_group = false
        and ac.user_id = auth.uid()
    )
    and (
      exists (
        select 1 from public.athletes a
        where a.id = conversation_members.athlete_id and a.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.friendships f
        join public.athletes me on me.user_id = auth.uid()
        where f.status = 'accepted'
          and (
            (f.athlete_id = me.id and f.friend_id = conversation_members.athlete_id)
            or (f.friend_id = me.id and f.athlete_id = conversation_members.athlete_id)
          )
      )
    )
  );
