import { useCallback, useEffect, useState } from 'react';
import { fetchUnreadMessageCount } from '@/lib/notificationCounts';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { UNREAD_CHANGED_EVENT } from '@/lib/unreadMessages';
import { supabase } from '@/services/supabase';

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
    setCount(await fetchUnreadMessageCount(aid));
  }, []);

  useEffect(() => {
    void fetchCount();

    const onUnreadChanged = () => void fetchCount();
    window.addEventListener(UNREAD_CHANGED_EVENT, onUnreadChanged);

    const channelName = `unread-count-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
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
