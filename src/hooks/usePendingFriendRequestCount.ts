import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { UNREAD_CHANGED_EVENT } from '@/lib/unreadMessages';

/** Incoming friend requests awaiting accept/decline. */
export function usePendingFriendRequestCount(): number {
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

    const { count: pending, error } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('friend_id', aid)
      .eq('status', 'pending');

    if (error) {
      console.warn('[friend-requests] count failed:', error.message);
      setCount(0);
      return;
    }
    setCount(pending ?? 0);
  }, []);

  useEffect(() => {
    void fetchCount();

    const channel = supabase
      .channel('friend-request-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        void fetchCount();
      })
      .subscribe();

    window.addEventListener(UNREAD_CHANGED_EVENT, fetchCount);

    return () => {
      window.removeEventListener(UNREAD_CHANGED_EVENT, fetchCount);
      void supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  return count;
}
