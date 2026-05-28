import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { conversationUnreadKey, isUnread, UNREAD_CHANGED_EVENT } from '@/lib/unreadMessages';

/**
 * Returns the number of conversations with unread messages for the current user.
 * Subscribes to Realtime and local read-state updates.
 */
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCount(0);
      return;
    }
    const aid = await resolveAthleteId(user.id);
    if (!aid) {
      setCount(0);
      return;
    }

    const { data: memberships } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('athlete_id', aid);

    if (!memberships?.length) {
      setCount(0);
      return;
    }

    const convoIds = memberships.map((m) => m.conversation_id as string);

    const { data: msgs } = await supabase
      .from('conversation_messages')
      .select('conversation_id, created_at')
      .in('conversation_id', convoIds)
      .neq('athlete_id', aid)
      .order('created_at', { ascending: false });

    const latestByConv = new Map<string, string>();
    for (const m of msgs ?? []) {
      const cid = m.conversation_id as string;
      if (!latestByConv.has(cid)) latestByConv.set(cid, m.created_at as string);
    }

    let unread = 0;
    for (const [cid, at] of latestByConv) {
      if (isUnread(conversationUnreadKey(cid), at)) unread++;
    }

    setCount(unread);
  }, []);

  useEffect(() => {
    void fetchCount();

    const onUnreadChanged = () => void fetchCount();
    window.addEventListener(UNREAD_CHANGED_EVENT, onUnreadChanged);

    const channel = supabase
      .channel('unread-count-watcher')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_messages' }, () => {
        void fetchCount();
      })
      .subscribe();

    return () => {
      window.removeEventListener(UNREAD_CHANGED_EVENT, onUnreadChanged);
      void supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  return count;
}
