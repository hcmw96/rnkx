import { isDespia } from '@/services/despia';
import { insertAppleConnectDebugLog } from '@/lib/appleConnectDebugLog';
import {
  appleWatchConnectHealthKitCommand,
  requestAppleWatchHealthKitConnect,
} from '@/lib/healthKitWorkoutRead';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { getAuthUserId } from '@/lib/authSession';
import { supabase } from '@/services/supabase';

/** TEMPORARY: tag debug_logs.detail so this function's rows can be removed with the table. */
const DEBUG_FN = 'connectAppleHealthKit';

export type WearableProvider =
  | 'strava'
  | 'whoop'
  | 'garmin'
  | 'apple'
  | 'polar'
  | 'coros'
  | 'fitbit';

export type AppleConnectResult =
  | 'connected'
  | 'denied'
  | 'unavailable'
  | 'error';

/**
 * Onboarding Apple Watch connect — shared HealthKit probe, then persist wearables when possible.
 */
export async function connectAppleHealthKit(): Promise<{
  result: AppleConnectResult;
  message?: string;
}> {
  if (!isDespia()) {
    const result = 'unavailable' as const;
    // TEMPORARY diagnostics — remove with debug_logs / appleConnectDebugLog.
    insertAppleConnectDebugLog('result', { fn: DEBUG_FN, result });
    return {
      result,
      message: 'Apple Watch connects in the RNKX iPhone app.',
    };
  }

  const command = appleWatchConnectHealthKitCommand();
  insertAppleConnectDebugLog('probe_start', { fn: DEBUG_FN, command });

  const hk = await requestAppleWatchHealthKitConnect();
  if (hk === 'no_permission') {
    const result = 'denied' as const;
    insertAppleConnectDebugLog('result', { fn: DEBUG_FN, result });
    return {
      result,
      message: 'Apple Health access was denied. You can enable it later in Settings.',
    };
  }
  if (hk !== 'granted') {
    const result = 'error' as const;
    insertAppleConnectDebugLog('result', { fn: DEBUG_FN, result });
    return { result, message: 'Could not access Apple Health.' };
  }

  const authUserId = await getAuthUserId();
  if (authUserId) {
    const athleteId = (await resolveAthleteId(authUserId)) ?? authUserId;
    const { data: row } = await supabase
      .from('athletes')
      .select('id, wearables')
      .eq('id', athleteId)
      .maybeSingle();

    if (row?.id) {
      const current = (row.wearables as string[] | null) ?? [];
      const nextWearables = Array.from(new Set([...current, 'apple_watch']));
      const { error } = await supabase
        .from('athletes')
        .update({ wearables: nextWearables })
        .eq('id', row.id);
      if (error) {
        insertAppleConnectDebugLog('result', { fn: DEBUG_FN, result: 'error' });
        return { result: 'error', message: error.message };
      }
    }
  }

  insertAppleConnectDebugLog('result', { fn: DEBUG_FN, result: 'connected' });
  return { result: 'connected' };
}

/** After onboarding, open Settings → Devices & sync. */
export const AFTER_ONBOARDING_DEVICES_PATH = '/app/settings#devices';
export const AFTER_ONBOARDING_PATH_KEY = 'rnkx_after_onboarding_path';

export function queueOpenDevicesAfterOnboarding(): void {
  try {
    sessionStorage.setItem(AFTER_ONBOARDING_PATH_KEY, AFTER_ONBOARDING_DEVICES_PATH);
  } catch {
    // ignore
  }
}

export function consumeAfterOnboardingPath(): string | null {
  try {
    const path = sessionStorage.getItem(AFTER_ONBOARDING_PATH_KEY);
    sessionStorage.removeItem(AFTER_ONBOARDING_PATH_KEY);
    return path;
  } catch {
    return null;
  }
}
