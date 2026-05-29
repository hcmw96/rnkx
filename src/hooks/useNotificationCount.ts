import { useCallback, useEffect, useState } from 'react';
import { fetchTotalNotificationCount } from '@/lib/notificationCounts';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { UNREAD_CHANGED_EVENT } from '@/lib/unreadMessages';
import { supabase } from '@/services/supabase';

/** Unread messages + pending friend/club invites (matches Notifications page). */
export function useNotificationCount(): number {
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
    setCount(await fetchTotalNotificationCount(aid));
  }, []);

  useEffect(() => {
    void fetchCount();

    const channel = supabase
      .channel('notification-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        void fetchCount();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_league_members' }, () => {
        void fetchCount();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_messages' }, () => {
        void fetchCount();
      })
      .subscribe();

    const onUnreadChanged = () => void fetchCount();
    window.addEventListener(UNREAD_CHANGED_EVENT, onUnreadChanged);
    document.addEventListener('visibilitychange', onUnreadChanged);

    return () => {
      window.removeEventListener(UNREAD_CHANGED_EVENT, onUnreadChanged);
      document.removeEventListener('visibilitychange', onUnreadChanged);
      void supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  return count;
}
