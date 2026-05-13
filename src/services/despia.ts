import despia from 'despia-native';
import { toast } from 'sonner';

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
      ['healthkitResponse']
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

  try {
    const result = await despia(
      'healthkit://workouts?days=14&included=HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax,HKQuantityTypeIdentifierRunningSpeedAverage',
      ['healthkitWorkouts'],
    );

    console.log('[Despia] Raw response:', JSON.stringify(result, null, 2));

    const rawWorkouts = Array.isArray((result as any)?.healthkitWorkouts)
      ? (result as any).healthkitWorkouts
      : [];
    const firstRun = rawWorkouts.find((w: any) =>
      String(w.activityType ?? '').toLowerCase().includes('run'),
    );
    if (firstRun) {
      toast.message('run raw samples', {
        description: JSON.stringify(firstRun.samples ?? []).slice(0, 300),
      });
    }
    const workouts = normaliseWorkouts(rawWorkouts);

    return { workouts, rawPayload: result, error: null };
  } catch (err) {
    console.error('[Despia] fetchRecentWorkouts failed:', err);
    return { workouts: [], rawPayload: null, error: String(err) };
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
    const avgPacePerKm: number | null =
      speedMs && speedMs > 0
        ? Math.round(1000 / speedMs)
        : typeof w.avgPacePerKm === 'number'
          ? w.avgPacePerKm
          : null;

    return {
      sourceId: String(
        w.uuid ??
          w.id ??
          w.sourceId ??
          `apple_${w.date ?? w.startDate ?? w.startedAt}_${w.activityType ?? 'unknown'}_${Math.round(typeof w.duration === 'number' ? w.duration : 0)}`,
      ),
      startedAt: String(w.date ?? w.startDate ?? w.startedAt ?? new Date().toISOString()),
      durationMin:
        typeof w.duration === 'number'
          ? w.duration / 60
          : typeof w.durationMin === 'number'
            ? w.durationMin
            : 0,
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
