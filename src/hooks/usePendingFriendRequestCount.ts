import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { UNREAD_CHANGED_EVENT } from '@/lib/unreadMessages';

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

    const [friendReqRes, clubInviteRes] = await Promise.all([
      supabase.from('friendships').select('id', { count: 'exact', head: true }).eq('friend_id', aid).eq('status', 'pending'),
      supabase
        .from('private_league_members')
        .select('league_id', { count: 'exact', head: true })
        .eq('athlete_id', aid)
        .eq('status', 'pending'),
    ]);

    if (friendReqRes.error) {
      console.warn('[friend-requests] count failed:', friendReqRes.error.message);
      setCount(0);
      return;
    }
    if (clubInviteRes.error) {
      console.warn('[club-invites] count failed:', clubInviteRes.error.message);
      setCount(friendReqRes.count ?? 0);
      return;
    }
    setCount((friendReqRes.count ?? 0) + (clubInviteRes.count ?? 0));
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
