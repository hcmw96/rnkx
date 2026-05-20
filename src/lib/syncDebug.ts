const STORAGE_KEY = 'rnkx_sync_debug';
const MAX_ENTRIES = 40;

export type SyncDebugStep =
  | 'sync_start'
  | 'sync_branch_apple'
  | 'hk_lock_wait'
  | 'hk_lock_acquired'
  | 'hk_lock_busy'
  | 'hk_fetch_start'
  | 'hk_fetch_returned'
  | 'hk_normalize_start'
  | 'hk_normalize_done'
  | 'hk_fetch_error'
  | 'sync_upload_start'
  | 'sync_upload_done'
  | 'sync_parse_start'
  | 'sync_parse_done'
  | 'sync_profile_reload'
  | 'sync_done'
  | 'max_hr_applied'
  | 'max_hr_apply_fail'
  | 'sync_step1_fail'
  | 'sync_step2_fail'
  | 'sync_step3_fail'
  | 'sync_crashed'
  | 'probe_start'
  | 'probe_done'
  | 'probe_skip_busy'
  | 'probe_fail';

export interface SyncDebugEntry {
  step: SyncDebugStep;
  at: string;
  detail?: Record<string, string | number | boolean | null | undefined>;
  error?: string;
}

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

export function appendSyncDebug(
  step: SyncDebugStep,
  detail?: SyncDebugEntry['detail'],
  error?: string,
): void {
  const entry: SyncDebugEntry = {
    step,
    at: new Date().toISOString(),
    ...(detail && Object.keys(detail).length > 0 ? { detail } : {}),
    ...(error ? { error } : {}),
  };

  try {
    const prev = getSyncDebugLog();
    const next = [...prev, entry].slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota / private mode — still log to console
  }

  console.log('[sync-debug]', step, detail ?? '', error ?? '');
}

export function getSyncDebugLog(): SyncDebugEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SyncDebugEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearSyncDebugLog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Short text for toast descriptions or support tickets. */
export function formatSyncDebugReport(maxLines = 8): string {
  const lines = getSyncDebugLog()
    .slice(-maxLines)
    .map((e) => {
      const bits: string[] = [e.at.slice(11, 19), e.step];
      if (e.detail) {
        const d = Object.entries(e.detail)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `${k}=${v}`)
          .join(',');
        if (d) bits.push(d);
      }
      if (e.error) bits.push(`err=${e.error.slice(0, 120)}`);
      return bits.join(' ');
    });
  return lines.length > 0 ? lines.join(' | ') : 'no debug entries';
}

/** Rough payload size without stringifying huge HealthKit blobs. */
export function estimateJsonBytes(value: unknown): number | null {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return null;
  }
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
