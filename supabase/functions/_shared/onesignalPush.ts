/** Despia native deep links: use data.path (SPA route), not top-level url. */

export type OneSignalPushInput = {
  appId: string;
  externalUserIds: string[];
  title: string;
  message: string;
  path: string;
};

export function buildOneSignalPayload(input: OneSignalPushInput): Record<string, unknown> {
  const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
  return {
    app_id: input.appId,
    include_external_user_ids: input.externalUserIds,
    headings: { en: input.title },
    contents: { en: input.message },
    data: { path },
  };
}

export function pathFromUrl(url: string, fallback = '/app/dashboard'): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
