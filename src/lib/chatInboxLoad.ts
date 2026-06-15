import { clubImageDisplayUrl } from '@/lib/clubImageUpload';
import { conversationUnreadKey, isUnread } from '@/lib/unreadMessages';
import { supabase } from '@/services/supabase';

export type ChatInboxItem = {
  id: string;
  type: 'dm' | 'group';
  name: string;
  avatar: string | null;
  profileAvatarUrl?: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: boolean;
  link: string;
  conversationId: string;
  friendId?: string;
};

export async function loadDmInboxItems(athleteId: string): Promise<ChatInboxItem[]> {
  const { data, error } = await supabase.rpc('list_dm_inbox', {
    p_athlete_id: athleteId,
  });

  if (error) {
    console.error('[chatInbox] list_dm_inbox:', error.message);
    return [];
  }

  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return rows.map((row) => {
    const r = row as {
      conversation_id: string;
      friend_id: string;
      friend_username: string | null;
      friend_avatar_url: string | null;
      last_message: string | null;
      last_message_at: string | null;
      last_message_sender_id?: string | null;
    };
    const lastMessageAt = r.last_message_at || new Date(0).toISOString();
    return {
      id: `dm-${r.conversation_id}`,
      type: 'dm' as const,
      name: r.friend_username || 'Unknown',
      avatar: null,
      profileAvatarUrl: r.friend_avatar_url,
      lastMessage: r.last_message || 'No messages yet',
      lastMessageAt,
      unread: isUnread(conversationUnreadKey(r.conversation_id), lastMessageAt, {
        myAthleteId: athleteId,
        lastMessageAthleteId: r.last_message_sender_id ?? null,
      }),
      link: `/app/chat/${r.friend_id}`,
      conversationId: r.conversation_id,
      friendId: r.friend_id,
    };
  });
}

export async function loadGroupInboxItems(athleteId: string): Promise<ChatInboxItem[]> {
  const { data, error } = await supabase.rpc('list_group_inbox', {
    p_athlete_id: athleteId,
  });

  if (error) {
    console.error('[chatInbox] list_group_inbox:', error.message);
    return [];
  }

  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return rows.map((row) => {
    const r = row as {
      conversation_id: string;
      group_name: string | null;
      league_id: string | null;
      club_image_url: string | null;
      club_league_type: string | null;
      last_message: string | null;
      last_message_at: string | null;
      last_message_sender_id?: string | null;
    };
    const conversationId = String(r.conversation_id);
    const lastMessageAt = r.last_message_at || new Date(0).toISOString();
    const leagueId = r.league_id ? String(r.league_id) : conversationId;
    const avatar = r.club_image_url
      ? clubImageDisplayUrl(r.club_image_url, {
          cacheKey: leagueId,
          leagueType: r.club_league_type ?? 'engine',
        })
      : null;

    return {
      id: `group-${conversationId}`,
      type: 'group' as const,
      name: r.group_name?.trim() || 'Group chat',
      avatar,
      lastMessage: r.last_message || 'No messages yet',
      lastMessageAt,
      unread: isUnread(conversationUnreadKey(conversationId), lastMessageAt, {
        myAthleteId: athleteId,
        lastMessageAthleteId: r.last_message_sender_id ?? null,
      }),
      link: `/app/chat/group/${conversationId}`,
      conversationId,
    };
  });
}

export async function loadUnifiedChatInbox(athleteId: string): Promise<ChatInboxItem[]> {
  const [dmItems, groupItems] = await Promise.all([
    loadDmInboxItems(athleteId),
    loadGroupInboxItems(athleteId),
  ]);

  return [...dmItems, ...groupItems].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}
