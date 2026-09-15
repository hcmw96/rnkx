import { supabase } from '@/services/supabase';

/** Display name for push copy: prefer display_name, then username. */
export async function fetchAthleteNotifyName(athleteId: string): Promise<string> {
  const { data } = await supabase
    .from('athletes')
    .select('display_name, username')
    .eq('id', athleteId)
    .maybeSingle();
  const display = typeof data?.display_name === 'string' ? data.display_name.trim() : '';
  if (display) return display;
  const username = typeof data?.username === 'string' ? data.username.trim() : '';
  if (username) return username;
  return 'Someone';
}

/** Fire-and-forget edge function invoke for push notifications — never blocks UI. */
export function invokePushNotify(functionName: string, body: Record<string, unknown>): void {
  void (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const { data, error } = await supabase.functions.invoke(functionName, { body, headers });
    if (error) {
      console.warn(`[Push] ${functionName} invoke error:`, error.message);
      return;
    }
    const payload = data as {
      success?: boolean;
      partial?: boolean;
      error?: unknown;
      errors?: unknown;
    } | null;
    if (payload?.partial === true) {
      console.warn(
        `[Push] ${functionName} partial (device not subscribed):`,
        payload.errors ?? payload.error ?? payload,
      );
      return;
    }
    if (payload && payload.success === false) {
      console.warn(`[Push] ${functionName} rejected:`, payload.error ?? payload);
    }
  })().catch((err) => console.warn(`[Push] ${functionName} failed:`, err));
}
