/** Despia OneSignal tap → in-app route. See setup.despia.com/native-features/onesignal/reference */

export type NotificationOpenPayload = {
  type?: string;
  path?: string;
  url?: string;
  metadata?: unknown;
  data?: unknown;
  custom?: unknown;
  additionalData?: unknown;
};

const PENDING_PATH_KEY = 'rnkx_pending_notification_path';

let navigateFn: ((path: string) => void) | null = null;

export function registerNotificationNavigate(fn: ((path: string) => void) | null): void {
  navigateFn = fn;
}

function persistPendingPath(path: string): void {
  try {
    sessionStorage.setItem(PENDING_PATH_KEY, path);
    localStorage.setItem(PENDING_PATH_KEY, path);
  } catch {
    // ignore quota errors
  }
}

function readPendingPath(): string | null {
  try {
    return sessionStorage.getItem(PENDING_PATH_KEY) || localStorage.getItem(PENDING_PATH_KEY);
  } catch {
    return null;
  }
}

function clearPendingPath(): void {
  try {
    sessionStorage.removeItem(PENDING_PATH_KEY);
    localStorage.removeItem(PENDING_PATH_KEY);
  } catch {
    // ignore
  }
}

/** App routes we deep-link to from push (must start with /app/ and not be bare /app). */
export function getAppDeepLinkFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (!path.startsWith('/app/')) return null;
  if (path === '/app/' || path === '/app') return null;
  return path;
}

function pathFromRecord(record: Record<string, unknown>): string | null {
  const path = typeof record.path === 'string' ? record.path.trim() : '';
  if (path) return path.startsWith('/') ? path : `/${path}`;

  const url = typeof record.url === 'string' ? record.url.trim() : '';
  if (!url) return null;

  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    if (url.startsWith('/')) return url;
    return null;
  }
}

export function extractNotificationPath(payload: NotificationOpenPayload | null | undefined): string | null {
  if (!payload) return null;

  const top = pathFromRecord(payload as Record<string, unknown>);
  if (top) return top;

  const nestedSources = [payload.data, payload.custom, payload.additionalData, payload.metadata];
  for (const raw of nestedSources) {
    if (raw == null) continue;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const fromParsed = pathFromRecord(parsed);
        if (fromParsed) return fromParsed;
      } catch {
        if (raw.startsWith('/')) return raw;
      }
      continue;
    }
    if (typeof raw === 'object') {
      const fromObj = pathFromRecord(raw as Record<string, unknown>);
      if (fromObj) return fromObj;
    }
  }

  return null;
}

export function navigateFromNotification(payload: NotificationOpenPayload | null | undefined): void {
  const path = extractNotificationPath(payload);
  if (!path) {
    console.warn('[Push] notification tap had no path — staying on current screen', payload);
    return;
  }

  console.log('[Push] navigate from notification', path);

  if (navigateFn) {
    navigateFn(path);
    clearPendingPath();
    return;
  }

  persistPendingPath(path);
  try {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    // ignore
  }
}

export function consumePendingNotificationPath(): string | null {
  const pending = readPendingPath();
  if (pending) clearPendingPath();
  return pending;
}

/** Resolve notification payload, pending storage, or URL Despia already applied. */
export function resolveDeepLinkTarget(
  payload?: NotificationOpenPayload | null,
): string | null {
  const fromPayload = extractNotificationPath(payload ?? null);
  if (fromPayload) return fromPayload;

  const pending = readPendingPath();
  if (pending) return pending;

  return getAppDeepLinkFromLocation();
}

export function applyDeepLinkNavigation(
  navigate: (path: string) => void,
  payload?: NotificationOpenPayload | null,
): boolean {
  const path = resolveDeepLinkTarget(payload);
  if (!path) return false;

  clearPendingPath();
  navigate(path);
  return true;
}

export function installNotificationOpenHandler(): void {
  window.onNotificationEvent = (payload: NotificationOpenPayload) => {
    navigateFromNotification(payload);
  };
}
