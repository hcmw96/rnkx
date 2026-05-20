let healthKitOwner: string | null = null;

export function isHealthKitBusy(): boolean {
  return healthKitOwner != null;
}

/** Only one HealthKit workout read at a time (probe vs sync). */
export function tryAcquireHealthKit(owner: string): boolean {
  if (healthKitOwner != null && healthKitOwner !== owner) return false;
  healthKitOwner = owner;
  return true;
}

export function releaseHealthKit(owner: string): void {
  if (healthKitOwner === owner) healthKitOwner = null;
}

export async function waitForHealthKitIdle(maxMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (isHealthKitBusy()) {
    if (Date.now() - start >= maxMs) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

export function summarizeRawHealthKitWorkouts(raw: unknown[]): {
  count: number;
  sampleKeys: string;
  totalSamples: number;
} {
  let totalSamples = 0;
  const keys = new Set<string>();
  for (const item of raw.slice(0, 50)) {
    const w = item as Record<string, unknown>;
    if (Array.isArray(w.samples)) {
      totalSamples += w.samples.length;
      for (const s of w.samples as { key?: string }[]) {
        if (s?.key) keys.add(String(s.key));
      }
    }
  }
  const extra = raw.length > 50 ? `+${raw.length - 50} more` : '';
  return {
    count: raw.length,
    sampleKeys: [...keys].slice(0, 6).join(',') + extra,
    totalSamples,
  };
}
