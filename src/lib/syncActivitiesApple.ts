/** Request body for `sync-activities` when sending Despia / HK-derived workouts. */
export function buildSyncActivitiesAppleBody(workouts: unknown[]) {
  return { appleWorkouts: workouts, source: 'apple' as const };
}
