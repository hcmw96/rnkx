import type { WorkoutObject } from '@/services/despia';

const MIN_PEAK_BPM = 80;
const MAX_PEAK_BPM = 230;

/** Highest plausible peak HR from this batch of Apple workouts. */
export function inferMaxHrFromAppleWorkouts(workouts: WorkoutObject[]): number | null {
  let best: number | null = null;
  for (const w of workouts) {
    const p = w.peakHr;
    if (typeof p === 'number' && Number.isFinite(p) && p >= MIN_PEAK_BPM && p <= MAX_PEAK_BPM) {
      const r = Math.round(p);
      best = best === null ? r : Math.max(best, r);
    }
  }
  return best;
}

/** Only overwrite profile max HR from Apple when user has not set it manually or via WHOOP/Terra. */
export function shouldApplyAppleMaxHrToProfile(maxHrSource: string | null | undefined): boolean {
  const s = maxHrSource ?? '';
  if (s === 'manual') return false;
  if (s === 'whoop_historic' || s === 'whoop_live') return false;
  if (s === 'terra_live') return false;
  return true;
}

export function nextProfileMaxHrFromApple(
  currentMaxHr: number | null,
  inferredFromBatch: number | null,
): number | null {
  if (inferredFromBatch === null) return null;
  const cur = currentMaxHr ?? 0;
  const next = Math.max(cur, inferredFromBatch);
  return next >= MIN_PEAK_BPM ? next : null;
}
