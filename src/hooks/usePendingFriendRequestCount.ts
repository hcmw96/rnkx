import { useCallback, useEffect, useState } from 'react';
import { fetchPendingInviteCount } from '@/lib/notificationCounts';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { UNREAD_CHANGED_EVENT } from '@/lib/unreadMessages';
import { supabase } from '@/services/supabase';

/** Incoming friend requests + club invites awaiting action. */
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
    setCount(await fetchPendingInviteCount(aid));
  }, []);

  useEffect(() => {
    void fetchCount();

    const channel = supabase
      .channel('friend-request-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        void fetchCount();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_league_members' }, () => {
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
