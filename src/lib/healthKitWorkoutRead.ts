import despia from 'despia-native';

const SYNC_INCLUDED =
  'HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax,HKQuantityTypeIdentifierRunningSpeedAverage,HKQuantityTypeIdentifierDistanceWalkingRunningSum';

const PROBE_INCLUDED = 'HKQuantityTypeIdentifierHeartRateAverage';

export type HealthKitWorkoutReadKind = 'sync' | 'probe';

export function healthKitWorkoutsCommand(kind: HealthKitWorkoutReadKind): string {
  if (kind === 'sync') {
    return `healthkit://workouts?days=7&included=${SYNC_INCLUDED}`;
  }
  return `healthkit://workouts?days=5&included=${PROBE_INCLUDED}`;
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
