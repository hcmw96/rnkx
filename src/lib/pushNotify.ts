import { supabase } from '@/services/supabase';

/** Fire-and-forget edge function invoke for push notifications — never blocks UI. */
export function invokePushNotify(functionName: string, body: Record<string, unknown>): void {
  void supabase.functions
    .invoke(functionName, { body })
    .catch((err) => console.warn(`[Push] ${functionName} failed:`, err));
}
