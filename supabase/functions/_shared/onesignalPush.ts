/** Despia native deep links: use data.path (SPA route), not top-level url. */

export type OneSignalPushInput = {
  appId: string;
  externalUserIds: string[];
  title: string;
  message: string;
  path: string;
  /** iOS home-screen badge — only set when explicitly provided; otherwise update-app-badge owns the count. */
  iosBadge?: { type: 'SetTo' | 'Increase'; count: number };
};

export function buildOneSignalPayload(input: OneSignalPushInput): Record<string, unknown> {
  const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
  const externalIds = input.externalUserIds.map((id) => String(id).trim()).filter(Boolean);
  const payload: Record<string, unknown> = {
    app_id: input.appId,
    target_channel: 'push',
    include_aliases: { external_id: externalIds },
    headings: { en: input.title },
    contents: { en: input.message },
    data: { path },
  };
  // Badge is synced explicitly via update-app-badge — avoid fighting per-push increments.
  if (input.iosBadge) {
    payload.ios_badgeType = input.iosBadge.type;
    payload.ios_badgeCount = input.iosBadge.count;
  }
  return payload;
}

export function pathFromUrl(url: string, fallback = '/app/dashboard'): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
