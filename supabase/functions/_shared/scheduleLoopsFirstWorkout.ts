import { getServiceRoleKey, getSupabaseUrl } from './pushAuth.ts';

/** Fire-and-forget Loops first-workout event. Never throws; never delays the caller. */
export function scheduleLoopsFirstWorkout(athleteId: string, logLabel: string): void {
  const id = athleteId.trim();
  if (!id) return;

  const baseUrl = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  if (!serviceKey) {
    console.error(`[${logLabel}] loops-first-workout skipped: missing service role key`);
    return;
  }

  const promise = fetch(`${baseUrl}/functions/v1/loops-first-workout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ athleteId: id }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error(`[${logLabel}] loops-first-workout HTTP ${res.status}`, detail);
      }
    })
    .catch((err) => {
      console.error(`[${logLabel}] loops-first-workout invoke failed`, err);
    });

  const waitUntil = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime?.waitUntil;
  if (typeof waitUntil === 'function') waitUntil(promise);
}
