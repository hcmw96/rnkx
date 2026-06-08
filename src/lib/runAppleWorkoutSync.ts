import {
  inferMaxHrFromAppleWorkouts,
  nextProfileMaxHrFromApple,
  shouldApplyAppleMaxHrToProfile,
} from '@/lib/appleMaxHr';
import { waitForHealthKitIdle } from '@/lib/healthKitSync';
import { syncAppleWorkoutsToDatabase } from '@/lib/syncActivitiesApple';
import { fetchRecentWorkouts } from '@/services/despia';
import type { WorkoutObject } from '@/services/despia';
import { supabase } from '@/services/supabase';
import type { ProcessActivityRpcResult } from '@/types/shareCards';

export type AppleWorkoutSyncProfile = {
  max_hr?: number | string | null;
  max_hr_source?: string | null;
};

export type AppleWorkoutSyncResult = {
  ok: boolean;
  processed: number;
  workouts: WorkoutObject[];
  results: ProcessActivityRpcResult[];
  error: string | null;
};

function parseMaxHr(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Read HealthKit on Despia iPhone and upload workouts via sync_apple_workouts RPC. */
export async function runAppleWorkoutSync(
  athleteId: string,
  profile?: AppleWorkoutSyncProfile,
): Promise<AppleWorkoutSyncResult> {
  const empty = (error: string): AppleWorkoutSyncResult => ({
    ok: false,
    processed: 0,
    workouts: [],
    results: [],
    error,
  });

  const idle = await waitForHealthKitIdle(15_000);
  if (!idle) {
    return empty('HealthKit is busy — wait a moment and try again');
  }

  let syncData: Awaited<ReturnType<typeof fetchRecentWorkouts>>;
  try {
    syncData = await fetchRecentWorkouts();
  } catch (err) {
    return empty(String(err));
  }

  if (syncData.error) {
    return empty(syncData.error);
  }

  const workouts = syncData.workouts;
  const { processed, results, error } = await syncAppleWorkoutsToDatabase(athleteId, workouts);
  if (error) {
    return empty(error);
  }

  if (profile && shouldApplyAppleMaxHrToProfile(profile.max_hr_source)) {
    const inferred = inferMaxHrFromAppleWorkouts(workouts);
    const curMax = parseMaxHr(profile.max_hr);
    const nextMax = nextProfileMaxHrFromApple(curMax, inferred);
    const needsMaxHrWrite =
      nextMax !== null &&
      (curMax !== nextMax || profile.max_hr_source !== 'apple_watch');
    if (needsMaxHrWrite) {
      await supabase
        .from('athletes')
        .update({ max_hr: nextMax, max_hr_source: 'apple_watch' })
        .eq('id', athleteId);
    }
  }

  return { ok: true, processed, workouts, results, error: null };
}
