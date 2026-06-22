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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setCount(0);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        void fetchCount();
      }
    });

    const channelName = `friend-request-count-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
        void fetchCount();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'private_league_members' }, () => {
        void fetchCount();
      })
      .subscribe();

    const onRefresh = () => void fetchCount();
    window.addEventListener(UNREAD_CHANGED_EVENT, onRefresh);
    document.addEventListener('visibilitychange', onRefresh);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener(UNREAD_CHANGED_EVENT, onRefresh);
      document.removeEventListener('visibilitychange', onRefresh);
      void supabase.removeChannel(channel);
    };
  }, [fetchCount]);

  return count;
}
