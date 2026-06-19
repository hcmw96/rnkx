import { getOneSignalApiKey, getOneSignalAppId } from './onesignalEnv.ts';
import type { OneSignalPushInput } from './onesignalPush.ts';
import { buildOneSignalPayload } from './onesignalPush.ts';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

export type OneSignalSendResult = {
  httpOk: boolean;
  status: number;
  body: Record<string, unknown>;
  notificationId: string | null;
  errors: unknown;
};

export function getOneSignalCredentials(): { appId: string; apiKey: string } | null {
  const appId = getOneSignalAppId();
  const apiKey = getOneSignalApiKey();
  if (!appId || !apiKey) return null;
  return { appId, apiKey };
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

  const osRes = await fetch(ONESIGNAL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${creds.apiKey}`,
    },
    body: JSON.stringify(buildOneSignalPayload({ ...input, appId: creds.appId })),
  });

  const osJson = (await osRes.json().catch(() => ({}))) as Record<string, unknown>;
  const errors = osJson.errors ?? null;
  const rawId = osJson.id;
  const notificationId = typeof rawId === 'string' && rawId.length > 0 ? rawId : null;

  return {
    httpOk: osRes.ok,
    status: osRes.status,
    body: osJson,
    notificationId,
    errors,
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
    console.warn(`[${label}] OneSignal partial`, { errors: result.errors, ...logCtx });
    return {
      httpStatus: 200,
      payload: {
        success: true,
        partial: true,
        oneSignalId: result.notificationId,
        errors: result.errors,
      },
    };
  }

  console.log(`[${label}] onesignal ok`, { oneSignalId: result.notificationId, ...logCtx });
  return { httpStatus: 200, payload: { success: true, oneSignalId: result.notificationId } };
}

export function sanitizePushText(s: string, max: number): string {
  const t = s.replace(/[\r\n\u0000]/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
