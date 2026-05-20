import type { WorkoutObject } from '@/services/despia';
import { supabase } from '@/services/supabase';

export type SyncAppleWorkoutsResult = {
  processed: number;
  error: string | null;
};

/** Upload Apple workouts via PostgREST RPC (works when Edge Functions are blocked in WebView). */
export async function syncAppleWorkoutsToDatabase(
  athleteId: string,
  workouts: WorkoutObject[],
): Promise<SyncAppleWorkoutsResult> {
  const { data, error } = await supabase.rpc('sync_apple_workouts', {
    p_athlete_id: athleteId,
    p_workouts: workouts,
  });

  if (error) {
    return { processed: 0, error: error.message };
  }

  const processed =
    data && typeof data === 'object' && 'processed' in data
      ? Number((data as { processed: number }).processed) || 0
      : 0;

  return { processed, error: null };
}

/** @deprecated Use syncAppleWorkoutsToDatabase */
export function buildSyncActivitiesAppleBody(workouts: unknown[]) {
  return { appleWorkouts: workouts, source: 'apple' as const };
}
