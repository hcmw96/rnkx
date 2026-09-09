import { supabase } from '@/services/supabase';

/** Fire-and-forget — must never delay or fail onboarding. */
export function notifyLoopsAccountCreated(athleteId: string, email: string): void {
  const id = athleteId.trim();
  const addr = email.trim();
  if (!id || !addr) return;

  void supabase.functions
    .invoke('loops-account-created', { body: { athleteId: id, email: addr } })
    .then(({ error }) => {
      if (error) console.warn('[loops] accountCreated invoke error:', error.message);
    })
    .catch((err) => console.warn('[loops] accountCreated invoke failed:', err));
}
