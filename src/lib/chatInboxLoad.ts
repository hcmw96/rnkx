import { clubImageDisplayUrl } from '@/lib/clubImageUpload';
import { conversationUnreadKey, isUnread, prepareUnreadStateForAthlete } from '@/lib/unreadMessages';
import { supabase } from '@/services/supabase';

export type ChatInboxItem = {
  id: string;
  type: 'dm' | 'group';
  name: string;
  avatar: string | null;
  profileAvatarUrl?: string | null;
  leagueType?: 'engine' | 'run' | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: boolean;
  link: string;
  conversationId: string;
  friendId?: string;
};

export async function loadDmInboxItems(athleteId: string): Promise<ChatInboxItem[]> {
  await prepareUnreadStateForAthlete(athleteId);

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
  await prepareUnreadStateForAthlete(athleteId);

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
    const leagueId = r.league_id ? String(r.league_id) : conversationId;
    const leagueType =
      r.club_league_type === 'run' ? 'run' : r.club_league_type === 'engine' ? 'engine' : null;
    const hasMessage = Boolean(r.last_message?.trim());
    const lastMessageAt =
      hasMessage && r.last_message_at ? r.last_message_at : new Date(0).toISOString();
    const avatar = clubImageDisplayUrl(r.club_image_url, {
      cacheKey: leagueId,
      leagueType: leagueType ?? 'engine',
    });

    return {
      id: `group-${conversationId}`,
      type: 'group' as const,
      name: r.group_name?.trim() || 'Group chat',
      avatar,
      leagueType,
      lastMessage: hasMessage ? r.last_message!.trim() : 'No messages yet',
      lastMessageAt,
      unread: hasMessage
        ? isUnread(conversationUnreadKey(conversationId), r.last_message_at ?? null, {
            myAthleteId: athleteId,
            lastMessageAthleteId: r.last_message_sender_id ?? null,
          })
        : false,
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

  return [...dmItems, ...groupItems].sort((a, b) => {
    const aTs = new Date(a.lastMessageAt).getTime();
    const bTs = new Date(b.lastMessageAt).getTime();
    if (aTs !== bTs) return bTs - aTs;
    return a.name.localeCompare(b.name);
  });
}
