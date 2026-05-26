-- Fix infinite recursion: conversation_members SELECT must not query conversation_members under RLS.

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
