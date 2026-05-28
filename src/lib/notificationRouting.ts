/** Despia OneSignal tap → in-app route. See setup.despia.com/native-features/onesignal/reference */

export type NotificationOpenPayload = {
  type?: string;
  path?: string;
  url?: string;
  metadata?: unknown;
};

const PENDING_PATH_KEY = 'rnkx_pending_notification_path';

let navigateFn: ((path: string) => void) | null = null;

export function registerNotificationNavigate(fn: (path: string) => void): void {
  navigateFn = fn;
}

export function extractNotificationPath(payload: NotificationOpenPayload | null | undefined): string | null {
  if (!payload) return null;

  const rawPath = typeof payload.path === 'string' ? payload.path.trim() : '';
  if (rawPath) {
    return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  }

  const rawUrl = typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!rawUrl) return null;

  try {
    const u = new URL(rawUrl);
    return u.pathname + u.search + u.hash;
  } catch {
    if (rawUrl.startsWith('/')) return rawUrl;
    return null;
  }
}

export function navigateFromNotification(payload: NotificationOpenPayload | null | undefined): void {
  const path = extractNotificationPath(payload);
  if (!path) return;

  if (navigateFn) {
    navigateFn(path);
    return;
  }

  try {
    sessionStorage.setItem(PENDING_PATH_KEY, path);
  } catch {
    // ignore quota errors
  }
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function consumePendingNotificationPath(): string | null {
  try {
    const pending = sessionStorage.getItem(PENDING_PATH_KEY);
    if (pending) sessionStorage.removeItem(PENDING_PATH_KEY);
    return pending;
  } catch {
    return null;
  }
}

export function installNotificationOpenHandler(): void {
  window.onNotificationEvent = (payload: NotificationOpenPayload) => {
    navigateFromNotification(payload);
  };
}
