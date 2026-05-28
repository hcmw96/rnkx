import { supabase } from '@/services/supabase';

/** Fire-and-forget edge function invoke for push notifications — never blocks UI. */
export function invokePushNotify(functionName: string, body: Record<string, unknown>): void {
  void supabase.functions
    .invoke(functionName, { body })
    .then(({ data, error }) => {
      if (error) {
        console.warn(`[Push] ${functionName} invoke error:`, error.message);
        return;
      }
      const payload = data as { success?: boolean; error?: unknown } | null;
      if (payload && payload.success === false) {
        console.warn(`[Push] ${functionName} rejected:`, payload.error ?? payload);
      }
    })
    .catch((err) => console.warn(`[Push] ${functionName} failed:`, err));
}
