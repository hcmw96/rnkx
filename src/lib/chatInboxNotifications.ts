import { fetchClubByConversationId } from '@/lib/clubContext';
import { conversationUnreadKey, isUnread } from '@/lib/unreadMessages';
import { supabase } from '@/services/supabase';

export type ChatNotificationItem = {
  id: string;
  name: string;
  preview: string;
  at: string;
  link: string;
  isRead: boolean;
};

async function loadDmNotifications(athleteId: string): Promise<ChatNotificationItem[]> {
  const { data, error } = await supabase.rpc('list_dm_inbox', { p_athlete_id: athleteId });
  if (error) {
    console.warn('[chatInboxNotifications] list_dm_inbox:', error.message);
    return [];
  }

  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  const items: ChatNotificationItem[] = [];

  for (const row of rows) {
    const conversationId = String(row.conversation_id ?? '');
    const friendId = String(row.friend_id ?? '');
    const lastMessageAt = typeof row.last_message_at === 'string' ? row.last_message_at : null;
    if (!conversationId || !friendId || !lastMessageAt) continue;

    const unread = isUnread(conversationUnreadKey(conversationId), lastMessageAt, {
      myAthleteId: athleteId,
      lastMessageAthleteId:
        typeof row.last_message_sender_id === 'string' ? row.last_message_sender_id : null,
    });

    items.push({
      id: conversationId,
      name: String(row.friend_username ?? 'Direct message'),
      preview: String(row.last_message ?? 'New message'),
      at: lastMessageAt,
      link: `/app/chat/${friendId}`,
      isRead: !unread,
    });
  }

  return items;
}

async function loadGroupNotifications(athleteId: string): Promise<ChatNotificationItem[]> {
  const { data: memberships } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('athlete_id', athleteId);

  if (!memberships?.length) return [];

  const convoIds = memberships.map((m) => m.conversation_id as string);
  const { data: convos } = await supabase
    .from('conversations')
    .select('id, name')
    .in('id', convoIds)
    .eq('is_group', true);

  if (!convos?.length) return [];

  const items: ChatNotificationItem[] = [];

  for (const convo of convos) {
    const conversationId = convo.id as string;
    const { data: lastMsgs } = await supabase
      .from('conversation_messages')
      .select('content, created_at, athlete_id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1);

    const lastMsg = lastMsgs?.[0] as
      | { content?: string; created_at?: string; athlete_id?: string }
      | undefined;
    const lastMessageAt = lastMsg?.created_at;
    if (!lastMessageAt) continue;

    const { club } = await fetchClubByConversationId(conversationId);
    const unread = isUnread(conversationUnreadKey(conversationId), lastMessageAt, {
      myAthleteId: athleteId,
      lastMessageAthleteId: lastMsg?.athlete_id ?? null,
    });

    items.push({
      id: conversationId,
      name: club?.name || convo.name?.trim() || 'Group chat',
      preview: lastMsg?.content || 'New message',
      at: lastMessageAt,
      link: `/app/chat/group/${conversationId}`,
      isRead: !unread,
    });
  }

  return items;
}

/** Same inbox sources as ChatPage — used for the Notifications messages section. */
export async function fetchChatNotifications(athleteId: string): Promise<ChatNotificationItem[]> {
  const [dms, groups] = await Promise.all([
    loadDmNotifications(athleteId),
    loadGroupNotifications(athleteId),
  ]);

  const all = [...dms, ...groups];
  all.sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    return new Date(b.at).getTime() - new Date(a.at).getTime();
  });

  return all.slice(0, 40);
}
