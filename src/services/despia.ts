import despia from 'despia-native';
import {
  extractHealthkitWorkoutsArray,
  readHealthKitWorkouts,
} from '@/lib/healthKitWorkoutRead';
import {
  appendSyncDebug,
  estimateJsonBytes,
  releaseHealthKit,
  summarizeRawHealthKitWorkouts,
  tryAcquireHealthKit,
} from '@/lib/syncDebug';

export interface WorkoutObject {
  sourceId: string;
  startedAt: string;
  durationMin: number;
  activityType: string;
  avgHr: number | null;
  peakHr: number | null;
  distanceM: number | null;
  avgPacePerKm: number | null;
}

export interface DespiaSyncResult {
  workouts: WorkoutObject[];
  rawPayload: unknown;
  error: string | null;
}

export function isDespia(): boolean {
  return navigator.userAgent.toLowerCase().includes('despia');
}

export async function requestHealthKitPermissions(): Promise<boolean> {
  if (!isDespia()) return false;
  try {
    await despia(
      'healthkit://read?types=HKWorkoutTypeIdentifier,HKQuantityTypeIdentifierHeartRate,HKQuantityTypeIdentifierDistanceWalkingRunning,HKQuantityTypeIdentifierRunningSpeed&days=1',
      ['healthkitResponse'],
    );
    return true;
  } catch (err) {
    console.error('[Despia] Permission request failed:', err);
    return false;
  }
}

export async function fetchRecentWorkouts(): Promise<DespiaSyncResult> {
  if (!isDespia()) {
    console.log('[Despia] Not in Despia runtime — skipping HealthKit fetch');
    return { workouts: [], rawPayload: null, error: 'Not in Despia runtime' };
  }

  if (!tryAcquireHealthKit('sync')) {
    appendSyncDebug('hk_lock_busy', { owner: 'sync' });
    return {
      workouts: [],
      rawPayload: null,
      error: 'HealthKit read already in progress — try again in a few seconds',
    };
  }

  try {
    appendSyncDebug('hk_fetch_start', { kind: 'sync', days: 7 });

    const result = await readHealthKitWorkouts('sync');

    const rawWorkouts = extractHealthkitWorkoutsArray(result);
    const summary = summarizeRawHealthKitWorkouts(rawWorkouts);

    console.log('[Despia] HealthKit workouts:', summary.count, summary);

    appendSyncDebug('hk_fetch_returned', {
      despiaReturned: result != null,
      rawCount: summary.count,
      totalSamples: summary.totalSamples,
      sampleKeys: summary.sampleKeys.slice(0, 80),
    });

    appendSyncDebug('hk_normalize_start', { rawCount: summary.count });

    const workouts = normaliseWorkouts(rawWorkouts);

    const normalizedBytes = estimateJsonBytes(workouts);
    appendSyncDebug('hk_normalize_done', {
      normalizedCount: workouts.length,
      normalizedBytes: normalizedBytes ?? -1,
    });

    return { workouts, rawPayload: result, error: null };
  } catch (err) {
    const message = String(err);
    console.error('[Despia] fetchRecentWorkouts failed:', err);
    appendSyncDebug('hk_fetch_error', undefined, message);
    return { workouts: [], rawPayload: null, error: message };
  } finally {
    releaseHealthKit('sync');
  }
}

function normaliseWorkouts(raw: unknown): WorkoutObject[] {
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.workouts)
      ? ((raw as Record<string, unknown>).workouts as unknown[])
      : [];

  return items.map((item) => {
    const w = item as Record<string, unknown>;

    const avgHrSample = Array.isArray(w.samples)
      ? (w.samples as any[]).find((s: any) => s.key === 'HKQuantityTypeIdentifierHeartRateAverage')
      : null;
    const peakHrSample = Array.isArray(w.samples)
      ? (w.samples as any[]).find((s: any) => s.key === 'HKQuantityTypeIdentifierHeartRateMax')
      : null;

    const speedSample = Array.isArray(w.samples)
      ? (w.samples as any[]).find((s: any) => s.key === 'HKQuantityTypeIdentifierRunningSpeedAverage')
      : null;
    const speedMs = speedSample ? Number(speedSample.value) || null : null;

    const distanceSample = Array.isArray(w.samples)
      ? (w.samples as any[]).find((s: any) => s.key === 'HKQuantityTypeIdentifierDistanceWalkingRunningSum')
      : null;
    const distanceFromSample = distanceSample ? Number(distanceSample.value) || null : null;

    const durationMin =
      typeof w.duration === 'number'
        ? w.duration / 60
        : typeof w.durationMin === 'number'
          ? w.durationMin
          : 0;

    let avgPacePerKm: number | null = null;
    if (speedMs && speedMs > 0) {
      avgPacePerKm = Math.round(1000 / speedMs);
    } else if (distanceFromSample && distanceFromSample > 0) {
      avgPacePerKm = Math.round((durationMin * 60) / (distanceFromSample / 1000));
    } else if (typeof w.avgPacePerKm === 'number') {
      avgPacePerKm = w.avgPacePerKm;
    }

    return {
      sourceId: String(
        w.uuid ??
          w.id ??
          w.sourceId ??
          `apple_${w.date ?? w.startDate ?? w.startedAt}_${w.activityType ?? 'unknown'}_${Math.round(typeof w.duration === 'number' ? w.duration : 0)}`,
      ),
      startedAt: String(w.date ?? w.startDate ?? w.startedAt ?? new Date().toISOString()),
      durationMin,
      activityType: String(w.activityType ?? w.workoutActivityType ?? 'unknown'),
      avgHr: avgHrSample
        ? Number(avgHrSample.value) || null
        : typeof w.avgHr === 'number'
          ? w.avgHr
          : null,
      peakHr: peakHrSample
        ? Number(peakHrSample.value) || null
        : typeof w.peakHr === 'number'
          ? w.peakHr
          : null,
      distanceM:
        typeof w.totalDistance === 'number'
          ? w.totalDistance
          : typeof w.distanceM === 'number'
            ? w.distanceM
            : null,
      avgPacePerKm,
    };
  });
}
