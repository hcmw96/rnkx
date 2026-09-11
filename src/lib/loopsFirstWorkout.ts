import { supabase } from '@/services/supabase';

/** Fire-and-forget — must never delay or fail workout sync. */
export function notifyLoopsFirstWorkout(athleteId: string): void {
  const id = athleteId.trim();
  if (!id) return;

  void (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const { error } = await supabase.functions.invoke('loops-first-workout', {
      body: { athleteId: id },
      headers,
    });
    if (error) console.warn('[loops] firstWorkoutScored invoke error:', error.message);
  })().catch((err) => console.warn('[loops] firstWorkoutScored invoke failed:', err));
}
