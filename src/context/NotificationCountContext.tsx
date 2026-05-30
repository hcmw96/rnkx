import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { syncAppIconBadge } from '@/lib/appBadgeSync';
import { fetchTotalNotificationCount } from '@/lib/notificationCounts';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { UNREAD_CHANGED_EVENT } from '@/lib/unreadMessages';
import { supabase } from '@/services/supabase';

const NotificationCountContext = createContext(0);

export function useNotificationCount(): number {
  return useContext(NotificationCountContext);
}

type NotificationCountProviderProps = {
  children: ReactNode;
  enabled: boolean;
};

export function NotificationCountProvider({ children, enabled }: NotificationCountProviderProps) {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    void fetchCount();

    const channelName = `notification-count-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
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
  }, [enabled, fetchCount]);

  useEffect(() => {
    if (!enabled) return;
    syncAppIconBadge(count);
  }, [count, enabled]);

  return (
    <NotificationCountContext.Provider value={count}>{children}</NotificationCountContext.Provider>
  );
}
