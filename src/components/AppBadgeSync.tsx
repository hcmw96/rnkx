import { useEffect } from 'react';
import { syncAppIconBadge } from '@/lib/appBadgeSync';
import { useNotificationCount } from '@/hooks/useNotificationCount';

/** Keeps the native app icon badge in sync with unread notifications. */
export function AppBadgeSync() {
  const notificationCount = useNotificationCount();

  useEffect(() => {
    syncAppIconBadge(notificationCount);
  }, [notificationCount]);

  return null;
}
