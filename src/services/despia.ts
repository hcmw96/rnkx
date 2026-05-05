import despia from 'despia-native';

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
    const workoutResult = await despia('readhealthkit://HKWorkoutTypeIdentifier?days=14', ['healthkitResponse']);

    console.log('[Despia] Raw response:', JSON.stringify(workoutResult, null, 2));

    const workoutHk = (workoutResult as Record<string, unknown> | null)?.healthkitResponse as
      | Record<string, unknown>
      | undefined;
    const rawWorkouts = workoutHk?.HKWorkoutTypeIdentifier;
    const raw = Array.isArray(rawWorkouts) ? rawWorkouts : [];

    const workouts = normaliseWorkouts(raw);

    return { workouts, rawPayload: workoutResult, error: null };
  } catch (err) {
    console.error('[Despia] fetchRecentWorkouts failed:', err);
    return { workouts: [], rawPayload: null, error: String(err) };
  }
}

export interface HrSamplePoint {
  time: number;
  bpm: number;
}

/** Parse Despia HealthKit HR quantity samples (expects `sample.date`; falls back to common field names). */
export function parseHeartRateSamples(raw: unknown): HrSamplePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: HrSamplePoint[] = [];
  for (const item of raw) {
    const s = item as Record<string, unknown>;
    const dateVal = (s.date ?? s.startDate ?? s.endDate) as string | number | undefined;
    let timeMs = NaN;
    if (typeof dateVal === 'string') {
      timeMs = Date.parse(dateVal);
    } else if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
      timeMs = dateVal > 1e12 ? dateVal : dateVal * 1000;
    }
    const qty =
      typeof s.value === 'number'
        ? s.value
        : typeof s.quantity === 'number'
          ? s.quantity
          : typeof s.bpm === 'number'
            ? s.bpm
            : null;
    if (!Number.isFinite(timeMs) || qty === null || !Number.isFinite(qty)) continue;
    out.push({ time: timeMs, bpm: qty });
  }
  return out;
}

export function attachHrFromSamples(workouts: WorkoutObject[], hrRaw: unknown): WorkoutObject[] {
  const hrSamples = parseHeartRateSamples(Array.isArray(hrRaw) ? hrRaw : []);
  return workouts.map((w) => {
    const workoutStartMs = Date.parse(w.startedAt);
    if (!Number.isFinite(workoutStartMs)) return w;
    const workoutEndMs = workoutStartMs + Math.max(0, w.durationMin) * 60 * 1000;
    const inRange = hrSamples.filter((sample) => sample.time >= workoutStartMs && sample.time <= workoutEndMs);
    if (inRange.length === 0) return w;
    const sum = inRange.reduce((acc, sample) => acc + sample.bpm, 0);
    const avg = sum / inRange.length;
    return { ...w, avgHr: Math.round(avg * 10) / 10 };
  });
}

function normaliseWorkouts(raw: unknown): WorkoutObject[] {
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.workouts)
      ? ((raw as Record<string, unknown>).workouts as unknown[])
      : [];

  return items.map((item) => {
    const w = item as Record<string, unknown>;

    let avgPacePerKm: number | null = null;
    if (typeof w.avgPacePerKm === 'number') {
      avgPacePerKm = w.avgPacePerKm;
    } else if (typeof w.avgSpeed === 'number' && w.avgSpeed > 0) {
      avgPacePerKm = 1000 / (w.avgSpeed as number);
    }

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
      avgHr:
        typeof w.avgHeartRate === 'number'
          ? w.avgHeartRate
          : typeof w.avgHr === 'number'
            ? w.avgHr
            : null,
      peakHr:
        typeof w.maxHeartRate === 'number'
          ? w.maxHeartRate
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
