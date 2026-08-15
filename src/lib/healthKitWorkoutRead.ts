import despia from 'despia-native';

/** Used at connect time (days=1) — not for manual sync fetch. */
export const HEALTHKIT_WORKOUT_INCLUDED_FULL =
  'HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax,HKQuantityTypeIdentifierRunningSpeedAverage,HKQuantityTypeIdentifierDistanceWalkingRunningSum';

const PROBE_INCLUDED = 'HKQuantityTypeIdentifierHeartRateAverage';

/** days=7 + all metrics in one call has hung ~60s and killed the WebView on some devices. */
export const SYNC_DAYS = 5;

/** Proven safe on devices where RunningSpeed / Distance aggregates kill the WebView. */
export const SYNC_INCLUDED_HR =
  'HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax';

export type HealthKitWorkoutReadKind = 'sync' | 'probe';

export function healthKitWorkoutsCommand(kind: HealthKitWorkoutReadKind): string {
  if (kind === 'probe') {
    return `healthkit://workouts?days=1&included=${PROBE_INCLUDED}`;
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

export type AppleWatchHealthKitConnectResult = 'granted' | 'no_permission' | 'error';

const CONNECT_PROBE_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(id);
        resolve(value);
      },
      (err: unknown) => {
        window.clearTimeout(id);
        reject(err);
      },
    );
  });
}

/**
 * Apple Watch *connect* probe. Despia has no permission-only command — the first
 * HealthKit read shows the authorisation sheet. Omit `included` so we do not fetch
 * HR samples; `days` defaults to 1 on the native side.
 */
export function appleWatchConnectHealthKitCommand(): string {
  return 'healthkit://workouts';
}

export async function requestAppleWatchHealthKitConnect(): Promise<AppleWatchHealthKitConnectResult> {
  try {
    const raw = await withTimeout(
      despia(appleWatchConnectHealthKitCommand(), ['healthkitWorkouts']),
      CONNECT_PROBE_TIMEOUT_MS,
      'HealthKit connect timed out',
    );
    const result = (raw as Record<string, unknown> | null) ?? null;
    if (result == null || !('healthkitWorkouts' in result)) {
      return 'no_permission';
    }
    return 'granted';
  } catch {
    return 'error';
  }
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

  const hrResult = await despia(workoutsCommand(days, SYNC_INCLUDED_HR), ['healthkitWorkouts']);
  const hrWorkouts = extractHealthkitWorkoutsArray(hrResult);

  return {
    merged: hrWorkouts,
    phases: { hr: { count: hrWorkouts.length } },
  };
}
