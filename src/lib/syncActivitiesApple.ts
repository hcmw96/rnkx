import type { WorkoutObject } from '@/services/despia';
import { supabase } from '@/services/supabase';
import type { ProcessActivityRpcResult } from '@/types/shareCards';

export type SyncAppleWorkoutsResult = {
  processed: number;
  results: ProcessActivityRpcResult[];
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
    return { processed: 0, results: [], error: error.message };
  }

  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const processed = payload && 'processed' in payload ? Number(payload.processed) || 0 : 0;
  const rawResults = payload?.results;
  const results = Array.isArray(rawResults)
    ? (rawResults as ProcessActivityRpcResult[])
    : [];

  return { processed, results, error: null };
}

/** @deprecated Use syncAppleWorkoutsToDatabase */
export function buildSyncActivitiesAppleBody(workouts: unknown[]) {
  return { appleWorkouts: workouts, source: 'apple' as const };
}
