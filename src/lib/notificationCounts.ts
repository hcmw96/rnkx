import { conversationUnreadKey, isUnread } from '@/lib/unreadMessages';
import { supabase } from '@/services/supabase';

export async function fetchPendingInviteCount(athleteId: string): Promise<number> {
  const [friendReqRes, clubInviteRes] = await Promise.all([
    supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('friend_id', athleteId)
      .eq('status', 'pending'),
    supabase
      .from('private_league_members')
      .select('league_id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .eq('status', 'pending'),
  ]);

  if (friendReqRes.error || clubInviteRes.error) {
    return (friendReqRes.count ?? 0) + (clubInviteRes.error ? 0 : (clubInviteRes.count ?? 0));
  }

  return (friendReqRes.count ?? 0) + (clubInviteRes.count ?? 0);
}

export async function fetchUnreadMessageCount(athleteId: string): Promise<number> {
  const [{ data: dmRows }, { data: memberships }] = await Promise.all([
    supabase.rpc('list_dm_inbox', { p_athlete_id: athleteId }),
    supabase.from('conversation_members').select('conversation_id').eq('athlete_id', athleteId),
  ]);

  let unread = 0;

  for (const row of (Array.isArray(dmRows) ? dmRows : []) as Record<string, unknown>[]) {
    const conversationId = String(row.conversation_id ?? '');
    const lastMessageAt = typeof row.last_message_at === 'string' ? row.last_message_at : null;
    const lastMessageSenderId =
      typeof row.last_message_sender_id === 'string' ? row.last_message_sender_id : null;
    if (
      isUnread(conversationUnreadKey(conversationId), lastMessageAt, {
        myAthleteId: athleteId,
        lastMessageAthleteId: lastMessageSenderId,
      })
    ) {
      unread += 1;
    }
  }

  const convoIds = (memberships ?? []).map((m) => m.conversation_id as string);
  if (!convoIds.length) return unread;

  const { data: groupConvos } = await supabase
    .from('conversations')
    .select('id')
    .in('id', convoIds)
    .eq('is_group', true);

  for (const convo of groupConvos ?? []) {
    const conversationId = convo.id as string;
    const { data: lastMsgs } = await supabase
      .from('conversation_messages')
      .select('created_at, athlete_id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1);

    const last = lastMsgs?.[0] as { created_at?: string; athlete_id?: string } | undefined;
    if (
      isUnread(conversationUnreadKey(conversationId), last?.created_at ?? null, {
        myAthleteId: athleteId,
        lastMessageAthleteId: last?.athlete_id ?? null,
      })
    ) {
      unread += 1;
    }
  }

  return unread;
}

export async function fetchTotalNotificationCount(athleteId: string): Promise<number> {
  const [unreadMessages, pendingInvites] = await Promise.all([
    fetchUnreadMessageCount(athleteId),
    fetchPendingInviteCount(athleteId),
  ]);
  return unreadMessages + pendingInvites;
}
