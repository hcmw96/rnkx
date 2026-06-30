import { getOneSignalApiKey, getOneSignalAppId } from './onesignalEnv.ts';
import type { OneSignalPushInput } from './onesignalPush.ts';

const ONESIGNAL_API = 'https://api.onesignal.com/notifications';
const ONESIGNAL_LEGACY_API = 'https://onesignal.com/api/v1/notifications';

export type OneSignalSendResult = {
  httpOk: boolean;
  status: number;
  body: Record<string, unknown>;
  notificationId: string | null;
  errors: unknown;
  targeting?: string;
  subscriptionCount?: number;
};

export function getOneSignalCredentials(): { appId: string; apiKey: string } | null {
  const appId = getOneSignalAppId();
  const apiKey = getOneSignalApiKey();
  if (!appId || !apiKey) return null;
  return { appId, apiKey };
}

type OneSignalUserSubscription = {
  id?: string;
  type?: string;
  enabled?: boolean;
};

async function fetchPushSubscriptionIds(
  appId: string,
  apiKey: string,
  externalUserIds: string[],
): Promise<string[]> {
  const subscriptionIds: string[] = [];

  for (const externalId of externalUserIds) {
    const trimmed = String(externalId).trim();
    if (!trimmed) continue;

    const url = `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, { headers: { Authorization: `Key ${apiKey}` } });
    if (!res.ok) continue;

    const json = (await res.json().catch(() => ({}))) as { subscriptions?: OneSignalUserSubscription[] };
    for (const sub of json.subscriptions ?? []) {
      const id = typeof sub.id === 'string' ? sub.id.trim() : '';
      const type = String(sub.type ?? '').toLowerCase();
      const isPush = type.includes('push') || type.includes('ios') || type.includes('android');
      if (id && isPush && sub.enabled !== false) {
        subscriptionIds.push(id);
      }
    }
  }

  return [...new Set(subscriptionIds)];
}

export async function sendOneSignalPush(input: OneSignalPushInput): Promise<OneSignalSendResult> {
  const creds = getOneSignalCredentials();
  if (!creds) {
    return {
      httpOk: false,
      status: 0,
      body: { error: 'missing OneSignal credentials' },
      notificationId: null,
      errors: 'missing credentials',
    };
  }

  const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
  const subscriptionIds = await fetchPushSubscriptionIds(
    creds.appId,
    creds.apiKey,
    input.externalUserIds,
  );

  const payload: Record<string, unknown> = {
    app_id: creds.appId,
    headings: { en: input.title },
    contents: { en: input.message },
    data: { path },
  };
  if (input.iosBadge) {
    payload.ios_badgeType = input.iosBadge.type;
    payload.ios_badgeCount = input.iosBadge.count;
  }
  if (subscriptionIds.length > 0) {
    payload.include_subscription_ids = subscriptionIds;
  } else {
    payload.target_channel = 'push';
    payload.include_aliases = {
      external_id: input.externalUserIds.map((id) => String(id).trim()).filter(Boolean),
    };
  }

  let osRes = await fetch(ONESIGNAL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${creds.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  let osJson = (await osRes.json().catch(() => ({}))) as Record<string, unknown>;
  let targeting = subscriptionIds.length > 0 ? 'subscription_ids' : 'aliases';

  // Legacy endpoint accepts subscription ids for apps still on mixed Player/User models.
  if (
    subscriptionIds.length > 0 &&
    osRes.ok &&
    osJson.errors &&
    !osJson.id
  ) {
    const legacyPayload = {
      app_id: creds.appId,
      include_player_ids: subscriptionIds,
      headings: payload.headings,
      contents: payload.contents,
      data: payload.data,
    };
    osRes = await fetch(ONESIGNAL_LEGACY_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${creds.apiKey}`,
      },
      body: JSON.stringify(legacyPayload),
    });
    osJson = (await osRes.json().catch(() => ({}))) as Record<string, unknown>;
    targeting = 'legacy_player_ids';
  }

  const errors = osJson.errors ?? null;
  const rawId = osJson.id;
  const notificationId = typeof rawId === 'string' && rawId.length > 0 ? rawId : null;

  return {
    httpOk: osRes.ok,
    status: osRes.status,
    body: osJson,
    notificationId,
    errors,
    targeting,
    subscriptionCount: subscriptionIds.length,
  };
}

export type NotifyOutcome = { httpStatus: number; payload: Record<string, unknown> };

/** Log OneSignal outcome and return HTTP status + JSON body for notifyJson(). */
export function outcomeFromOneSignal(
  label: string,
  result: OneSignalSendResult,
  logCtx: Record<string, unknown> = {},
): NotifyOutcome {
  if (result.status === 0) {
    console.error(`[${label}] missing OneSignal credentials`);
    return { httpStatus: 500, payload: { success: false, error: 'Server misconfiguration' } };
  }

  if (!result.httpOk) {
    console.error(`[${label}] OneSignal`, result.status, result.body, logCtx);
    return { httpStatus: 502, payload: { success: false, error: result.body } };
  }

  if (result.errors) {
    const warnings = result.body.warnings;
    console.warn(`[${label}] OneSignal partial`, {
      errors: result.errors,
      warnings,
      targeting: result.targeting,
      subscriptionCount: result.subscriptionCount,
      ...logCtx,
    });
    return {
      httpStatus: 200,
      payload: {
        success: true,
        partial: true,
        oneSignalId: result.notificationId,
        errors: result.errors,
        targeting: result.targeting,
        subscriptionCount: result.subscriptionCount,
      },
    };
  }

  console.log(`[${label}] onesignal ok`, {
    oneSignalId: result.notificationId,
    targeting: result.targeting,
    ...logCtx,
  });
  return { httpStatus: 200, payload: { success: true, oneSignalId: result.notificationId } };
}

export function sanitizePushText(s: string, max: number): string {
  const t = s.replace(/[\r\n\u0000]/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
