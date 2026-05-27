import { useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { isUnread } from '@/lib/unreadMessages';

/**
 * Returns the number of conversations with unread messages for the current user.
 * Subscribes to Realtime so the count updates without a page reload.
 */
export function useUnreadCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const aid = await resolveAthleteId(user.id);
      if (!aid || cancelled) return;

      const { data: memberships } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('athlete_id', aid);

      if (!memberships?.length || cancelled) return;

      const convoIds = memberships.map((m) => m.conversation_id as string);

      const { data: msgs } = await supabase
        .from('conversation_messages')
        .select('conversation_id, created_at')
        .in('conversation_id', convoIds)
        .neq('athlete_id', aid)
        .order('created_at', { ascending: false });

      if (cancelled) return;

      // Latest message per conversation
      const latestByConv = new Map<string, string>();
      for (const m of msgs ?? []) {
        const cid = m.conversation_id as string;
        if (!latestByConv.has(cid)) latestByConv.set(cid, m.created_at as string);
      }

      // Count conversations where latest non-own message is newer than last read
      let unread = 0;
      for (const [cid, at] of latestByConv) {
        // We don't know dm key here so check both patterns
        if (isUnread(`group-${cid}`, at) || isUnread(`dm-${cid}`, at)) {
          unread++;
        }
      }

      if (!cancelled) setCount(unread);
    }

    void fetchCount();

    const channel = supabase
      .channel('unread-count-watcher')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_messages' }, () => {
        void fetchCount();
      })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
