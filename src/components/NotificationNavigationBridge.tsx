import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  applyDeepLinkNavigation,
  getAppDeepLinkFromLocation,
  installNotificationOpenHandler,
  registerNotificationNavigate,
  type NotificationOpenPayload,
} from '@/lib/notificationRouting';

/** Wires React Router to Despia push notification taps (after auth shell is ready). */
export function NotificationNavigationBridge({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const appliedRef = useRef(false);

  useEffect(() => {
    installNotificationOpenHandler();
  }, []);

  useEffect(() => {
    if (!enabled) {
      registerNotificationNavigate(null);
      appliedRef.current = false;
      return;
    }

    registerNotificationNavigate((path) => {
      navigate(path, { replace: true });
    });

    const tryApply = (payload?: NotificationOpenPayload | null) =>
      applyDeepLinkNavigation((p) => navigate(p, { replace: true }), payload ?? null);

    if (tryApply()) {
      appliedRef.current = true;
    }

    const timers = [100, 400, 1200].map((ms) =>
      window.setTimeout(() => {
        if (appliedRef.current) return;
        if (tryApply()) appliedRef.current = true;
      }, ms),
    );

    const onPopState = () => {
      const deepLink = getAppDeepLinkFromLocation();
      if (!deepLink || deepLink === location.pathname + location.search + location.hash) return;
      navigate(deepLink, { replace: true });
      appliedRef.current = true;
    };

    window.addEventListener('popstate', onPopState);

    return () => {
      registerNotificationNavigate(null);
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('popstate', onPopState);
    };
  }, [enabled, navigate, location.pathname, location.search, location.hash]);

  return null;
}
