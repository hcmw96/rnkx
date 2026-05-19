import despia from 'despia-native';
import { appendSyncDebug } from '@/lib/syncDebug';

/** Used at connect time (days=1) — not for manual sync fetch. */
export const HEALTHKIT_WORKOUT_INCLUDED_FULL =
  'HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax,HKQuantityTypeIdentifierRunningSpeedAverage,HKQuantityTypeIdentifierDistanceWalkingRunningSum';

const PROBE_INCLUDED = 'HKQuantityTypeIdentifierHeartRateAverage';

/** days=7 + all metrics in one call has hung ~60s and killed the WebView on some devices. */
export const SYNC_DAYS = 5;

/** Proven safe on devices where combined pace metrics kill the WebView on the 2nd HK call. */
const SYNC_INCLUDED_HR =
  'HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax';

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

export interface SyncHealthKitReadResult {
  merged: unknown[];
  phases: { hr: { count: number } };
}

/**
 * Manual sync: single HealthKit read (HR only). Kirsty's trace showed HR returns
 * instantly but a 2nd call for distance/speed kills the WebView before JS runs again.
 * Distance/pace are taken from workout metadata in normaliseWorkouts when present.
 */
export async function readHealthKitWorkoutsForSync(): Promise<SyncHealthKitReadResult> {
  const days = SYNC_DAYS;

  appendSyncDebug('hk_fetch_start', { phase: 'hr', days, mode: 'hr_only' });
  const hrResult = await despia(workoutsCommand(days, SYNC_INCLUDED_HR), ['healthkitWorkouts']);
  const hrWorkouts = extractHealthkitWorkoutsArray(hrResult);
  appendSyncDebug('hk_fetch_returned', { phase: 'hr', rawCount: hrWorkouts.length, mode: 'hr_only' });

  return {
    merged: hrWorkouts,
    phases: { hr: { count: hrWorkouts.length } },
  };
}
