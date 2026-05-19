import despia from 'despia-native';
import { appendSyncDebug } from '@/lib/syncDebug';

/** Used at connect time (days=1) — not for manual sync fetch. */
export const HEALTHKIT_WORKOUT_INCLUDED_FULL =
  'HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax,HKQuantityTypeIdentifierRunningSpeedAverage,HKQuantityTypeIdentifierDistanceWalkingRunningSum';

const PROBE_INCLUDED = 'HKQuantityTypeIdentifierHeartRateAverage';

/** days=7 + all metrics in one call has hung ~60s and killed the WebView on some devices. */
export const SYNC_DAYS = 5;

const SYNC_INCLUDED_HR =
  'HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax';

const SYNC_INCLUDED_PACE =
  'HKQuantityTypeIdentifierRunningSpeedAverage,HKQuantityTypeIdentifierDistanceWalkingRunningSum';

export type HealthKitWorkoutReadKind = 'sync' | 'probe';

export function healthKitWorkoutsCommand(kind: HealthKitWorkoutReadKind): string {
  if (kind === 'probe') {
    return `healthkit://workouts?days=${SYNC_DAYS}&included=${PROBE_INCLUDED}`;
  }
  return `healthkit://workouts?days=${SYNC_DAYS}&included=${SYNC_INCLUDED_HR}`;
}

function workoutsCommand(days: number, included: string): string {
  return `healthkit://workouts?days=${days}&included=${included}`;
}

export async function readHealthKitWorkouts(
  kind: HealthKitWorkoutReadKind,
): Promise<Record<string, unknown> | null> {
  const result = await despia(healthKitWorkoutsCommand(kind), ['healthkitWorkouts']);
  return (result as Record<string, unknown> | null) ?? null;
}

export function extractHealthkitWorkoutsArray(
  result: Record<string, unknown> | null,
): unknown[] {
  const raw = result?.healthkitWorkouts;
  return Array.isArray(raw) ? raw : [];
}

function workoutMergeKey(w: Record<string, unknown>): string {
  if (w.uuid != null) return `uuid:${String(w.uuid)}`;
  if (w.id != null) return `id:${String(w.id)}`;
  if (w.sourceId != null) return `source:${String(w.sourceId)}`;
  const started = w.date ?? w.startDate ?? w.startedAt ?? '';
  const type = w.activityType ?? w.workoutActivityType ?? '';
  const duration = typeof w.duration === 'number' ? w.duration : 0;
  return `fallback:${String(started)}_${String(type)}_${duration}`;
}

function copySamples(w: Record<string, unknown>): unknown[] {
  return Array.isArray(w.samples) ? [...(w.samples as unknown[])] : [];
}

/** Merge two HealthKit workout lists (same days window) by workout id; combine sample arrays. */
export function mergeRawHealthKitWorkouts(primary: unknown[], secondary: unknown[]): unknown[] {
  const map = new Map<string, Record<string, unknown>>();

  for (const item of primary) {
    const w = item as Record<string, unknown>;
    map.set(workoutMergeKey(w), { ...w, samples: copySamples(w) });
  }

  for (const item of secondary) {
    const w = item as Record<string, unknown>;
    const key = workoutMergeKey(w);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...w, samples: copySamples(w) });
      continue;
    }
    const mergedSamples = [...copySamples(existing), ...copySamples(w)];
    map.set(key, {
      ...existing,
      ...w,
      samples: mergedSamples,
      totalDistance:
        typeof existing.totalDistance === 'number'
          ? existing.totalDistance
          : w.totalDistance,
      distanceM:
        typeof existing.distanceM === 'number' ? existing.distanceM : w.distanceM,
      peakHr: typeof existing.peakHr === 'number' ? existing.peakHr : w.peakHr,
      avgHr: typeof existing.avgHr === 'number' ? existing.avgHr : w.avgHr,
    });
  }

  return [...map.values()];
}

export type SyncHealthKitPhase = 'hr' | 'pace';

export interface SyncHealthKitReadResult {
  merged: unknown[];
  phases: Record<SyncHealthKitPhase, { count: number }>;
}

/**
 * Manual sync: two smaller HealthKit queries (HR, then pace/distance) over 5 days,
 * then merge — avoids the single heavy days=7 / 4-metric call that crashed some devices.
 */
export async function readHealthKitWorkoutsForSync(): Promise<SyncHealthKitReadResult> {
  const days = SYNC_DAYS;

  appendSyncDebug('hk_fetch_start', { phase: 'hr', days });
  const hrResult = await despia(workoutsCommand(days, SYNC_INCLUDED_HR), ['healthkitWorkouts']);
  const hrWorkouts = extractHealthkitWorkoutsArray(hrResult);
  appendSyncDebug('hk_fetch_returned', { phase: 'hr', rawCount: hrWorkouts.length });

  appendSyncDebug('hk_fetch_start', { phase: 'pace', days });
  const paceResult = await despia(workoutsCommand(days, SYNC_INCLUDED_PACE), ['healthkitWorkouts']);
  const paceWorkouts = extractHealthkitWorkoutsArray(paceResult);
  appendSyncDebug('hk_fetch_returned', { phase: 'pace', rawCount: paceWorkouts.length });

  const merged = mergeRawHealthKitWorkouts(hrWorkouts, paceWorkouts);

  return {
    merged,
    phases: {
      hr: { count: hrWorkouts.length },
      pace: { count: paceWorkouts.length },
    },
  };
}
