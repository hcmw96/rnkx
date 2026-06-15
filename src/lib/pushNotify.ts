import { supabase } from '@/services/supabase';

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
    const payload = data as { success?: boolean; error?: unknown } | null;
    if (payload && payload.success === false) {
      console.warn(`[Push] ${functionName} rejected:`, payload.error ?? payload);
    }
  })().catch((err) => console.warn(`[Push] ${functionName} failed:`, err));
}
