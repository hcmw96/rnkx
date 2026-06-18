import { conversationUnreadKey, ensureUnreadScopeForAthlete, isUnread } from '@/lib/unreadMessages';
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
  ensureUnreadScopeForAthlete(athleteId);

  const [{ data: dmRows }, { data: groupRows }] = await Promise.all([
    supabase.rpc('list_dm_inbox', { p_athlete_id: athleteId }),
    supabase.rpc('list_group_inbox', { p_athlete_id: athleteId }),
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

  for (const row of (Array.isArray(groupRows) ? groupRows : []) as Record<string, unknown>[]) {
    const conversationId = String(row.conversation_id ?? '');
    const lastMessage = typeof row.last_message === 'string' ? row.last_message.trim() : '';
    if (!lastMessage) continue;
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

  return unread;
}

export async function fetchTotalNotificationCount(athleteId: string): Promise<number> {
  const [unreadMessages, pendingInvites] = await Promise.all([
    fetchUnreadMessageCount(athleteId),
    fetchPendingInviteCount(athleteId),
  ]);
  return unreadMessages + pendingInvites;
}
