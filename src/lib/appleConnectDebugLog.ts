/**
 * TEMPORARY: Apple HealthKit connect probe diagnostics.
 * Writes to public.debug_logs. Remove this module and every call site when done.
 */
import { getAuthUserId } from '@/lib/authSession';
import { supabase } from '@/services/supabase';

export function insertAppleConnectDebugLog(
  event: string,
  detail: Record<string, unknown>,
): void {
  void insertAppleConnectDebugLogAsync(event, detail);
}

async function insertAppleConnectDebugLogAsync(
  event: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    const athleteId = (await getAuthUserId()) ?? null;
    await supabase.from('debug_logs').insert({
      athlete_id: athleteId,
      event,
      detail,
    });
  } catch {
    // Diagnostics must never affect connect.
  }
}
