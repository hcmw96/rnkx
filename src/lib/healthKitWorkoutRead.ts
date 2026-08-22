import despia from 'despia-native';
import type { WorkoutObject } from '@/services/despia';

/** Used at connect time (days=1) — not for manual sync fetch. */
export const HEALTHKIT_WORKOUT_INCLUDED_FULL =
  'HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax,HKQuantityTypeIdentifierRunningSpeedAverage,HKQuantityTypeIdentifierDistanceWalkingRunningSum';

const PROBE_INCLUDED = 'HKQuantityTypeIdentifierHeartRateAverage';

/** Wider window re-reads history; process_activity dedups on source_id. */
export const SYNC_DAYS = 30;

/** Proven safe on devices where RunningSpeed / Distance aggregates kill the WebView. */
export const SYNC_INCLUDED_HR =
  'HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax';

export type HealthKitWorkoutReadKind = 'sync' | 'probe';

export function healthKitWorkoutsCommand(kind: HealthKitWorkoutReadKind): string {
  if (kind === 'probe') {
    // TEMPORARY: days=30 to confirm the bridge returns workouts at all. Restore to 1.
    return `healthkit://workouts?days=30&included=${PROBE_INCLUDED}`;
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

/** iOS will not re-present the HealthKit sheet after a denial. */
export const APPLE_HEALTH_NO_PERMISSION_MESSAGE =
  'Enable Apple Health in iOS Settings → Privacy & Security → Health → RNKX. iOS will not ask again once access has been denied.';

function classifyConnectProbeResponse(raw: unknown): AppleWatchHealthKitConnectResult {
  if (raw == null) return 'no_permission';
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'no_permission';
  const rec = raw as Record<string, unknown>;
  if (Object.keys(rec).length === 0) return 'no_permission';
  if (!('healthkitWorkouts' in rec)) return 'no_permission';
  if (!Array.isArray(rec.healthkitWorkouts)) return 'no_permission';
  return 'granted';
}

const CONNECT_PROBE_TIMEOUT_MS = 90_000;
const CONNECT_PROBE_TIMEOUT_MESSAGE = 'HealthKit connect timed out';

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
 * HealthKit read shows the authorisation sheet. TEMPORARY days=30 to confirm the
 * bridge returns data; included stays the proven-safe HR types.
 */
export function appleWatchConnectHealthKitCommand(): string {
  return `healthkit://workouts?days=30&included=${SYNC_INCLUDED_HR}`;
}

export async function requestAppleWatchHealthKitConnect(): Promise<AppleWatchHealthKitConnectResult> {
  const command = appleWatchConnectHealthKitCommand();

  try {
    const raw = await withTimeout(
      despia(command, ['healthkitWorkouts']),
      CONNECT_PROBE_TIMEOUT_MS,
      CONNECT_PROBE_TIMEOUT_MESSAGE,
    );
    return classifyConnectProbeResponse(raw);
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
 * Distance/pace are taken from workout metadata in mapHealthKitWorkoutsForSync.
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

const HK_HR_AVG = 'HKQuantityTypeIdentifierHeartRateAverage';
const HK_HR_MAX = 'HKQuantityTypeIdentifierHeartRateMax';

/** Despia docs: sample value "0" means the signal was not recorded. */
function hkRecordedNumber(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

function hkSampleNumber(samples: unknown, key: string): number | null {
  if (!Array.isArray(samples)) return null;
  const hit = samples.find(
    (s) => s != null && typeof s === 'object' && (s as { key?: unknown }).key === key,
  ) as { value?: unknown } | undefined;
  return hit ? hkRecordedNumber(hit.value) : null;
}

/** Map healthkit://workouts elements to the sync-activities WorkoutObject payload. */
export function mapHealthKitWorkoutsForSync(raw: unknown[]): WorkoutObject[] {
  return raw.map((item) => {
    const w = item != null && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const date = String(w.date ?? '');
    const activityType = String(w.activityType ?? 'unknown');
    const durationSec = Number(w.duration);
    const durationMin = Number.isFinite(durationSec) ? durationSec / 60 : 0;
    const distanceM = hkRecordedNumber(w.distance);
    const roundedDuration = Math.round(Number.isFinite(durationSec) ? durationSec : 0);

    let avgPacePerKm: number | null = null;
    if (distanceM != null && distanceM > 0 && Number.isFinite(durationSec) && durationSec > 0) {
      avgPacePerKm = Math.round(durationSec / (distanceM / 1000));
    }

    return {
      sourceId: `apple_${date}_${activityType}_${roundedDuration}`,
      startedAt: date,
      durationMin,
      activityType,
      avgHr: hkSampleNumber(w.samples, HK_HR_AVG),
      peakHr: hkSampleNumber(w.samples, HK_HR_MAX),
      distanceM,
      avgPacePerKm,
    };
  });
}
