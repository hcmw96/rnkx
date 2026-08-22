import { isDespia } from '@/services/despia';
import {
  APPLE_HEALTH_NO_PERMISSION_MESSAGE,
  requestAppleWatchHealthKitConnect,
} from '@/lib/healthKitWorkoutRead';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { getAuthUserId } from '@/lib/authSession';
import { supabase } from '@/services/supabase';

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
    return {
      result: 'unavailable' as const,
      message: 'Apple Watch connects in the RNKX iPhone app.',
    };
  }

  const hk = await requestAppleWatchHealthKitConnect();
  if (hk === 'no_permission') {
    return {
      result: 'denied' as const,
      message: APPLE_HEALTH_NO_PERMISSION_MESSAGE,
    };
  }
  if (hk !== 'granted') {
    return { result: 'error' as const, message: 'Could not access Apple Health.' };
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
        return { result: 'error', message: error.message };
      }
    }
  }

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
