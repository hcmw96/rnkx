import type { WorkoutObject } from '@/services/despia';
import { isDespiaNative, registerPushForAthlete } from '@/services/onesignal';
import { supabase } from '@/services/supabase';
import type { ProcessActivityRpcResult } from '@/types/shareCards';

import { notifyWorkoutScoredPushes } from './pushAfterWorkoutScored';

function newlyScoredResults(results: ProcessActivityRpcResult[]): ProcessActivityRpcResult[] {
  return results.filter((r) => r.status === 'scored');
}

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

  const scored = newlyScoredResults(results);
  if (scored.length > 0) {
    // DB push may fire during RPC before the device is linked; re-link then notify from the client.
    if (isDespiaNative()) {
      try {
        await registerPushForAthlete(athleteId);
      } catch (err) {
        console.warn('[Push] re-link before workout notify failed:', err);
      }
    }
    notifyWorkoutScoredPushes(athleteId, scored);
  }

  return { processed, results, error: null };
}

/** @deprecated Use syncAppleWorkoutsToDatabase */
export function buildSyncActivitiesAppleBody(workouts: unknown[]) {
  return { appleWorkouts: workouts, source: 'apple' as const };
}
