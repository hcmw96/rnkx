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

/**
 * Whether an Apple-synced max HR may overwrite the stored profile value.
 *
 * Only a *manually* entered value is authoritative and protected. Every device
 * source (apple_watch / whoop_* / terra_live) uses highest-ever semantics — see
 * nextProfileMaxHrFromApple, which only ever raises the value — so letting Apple
 * push a genuinely higher observed peak is always safe and correct, even when the
 * current value came from an older WHOOP/Terra reading.
 *
 * Previously this also blocked whoop_historic / whoop_live / terra_live, which
 * permanently froze the max HR for anyone whose source was ever stamped by a
 * wearable they no longer use (e.g. an Apple-only athlete stuck on a stale
 * whoop_historic value) — their real Apple peaks were silently discarded.
 */
export function shouldApplyAppleMaxHrToProfile(maxHrSource: string | null | undefined): boolean {
  return (maxHrSource ?? '') !== 'manual';
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
