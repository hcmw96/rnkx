import { getServiceRoleKey, getSupabaseUrl } from './pushAuth.ts';

/** Invoke a notify-* edge function with service-role auth (pg_net / webhook equivalent). */
export async function invokePushEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
): Promise<void> {
  const baseUrl = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  if (!serviceKey) {
    console.error(`[invokePushEdgeFunction] missing service role key (${functionName})`);
    return;
  }

  const res = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[invokePushEdgeFunction] ${functionName} HTTP ${res.status}`, detail);
    return;
  }

  const payload = (await res.json().catch(() => null)) as { success?: boolean; error?: unknown } | null;
  if (payload && payload.success === false) {
    console.warn(`[invokePushEdgeFunction] ${functionName} rejected`, payload.error ?? payload);
  }
}
