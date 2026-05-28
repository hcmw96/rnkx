import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { consumePendingNotificationPath, registerNotificationNavigate } from '@/lib/notificationRouting';

/** Wires React Router to Despia push notification taps (after auth shell is ready). */
export function NotificationNavigationBridge({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;

    registerNotificationNavigate((path) => {
      navigate(path);
    });

    const pending = consumePendingNotificationPath();
    if (pending) {
      navigate(pending);
    }
  }, [enabled, navigate]);

  return null;
}
