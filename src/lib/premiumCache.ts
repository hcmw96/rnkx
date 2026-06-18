import { supabase } from '@/services/supabase';
import { getAuthUserId } from '@/lib/authSession';

let cached: { userId: string; isPremium: boolean } | null = null;

export function clearPremiumCache(): void {
  cached = null;
}

export function getCachedPremium(userId: string | undefined): boolean | null {
  if (!userId || !cached || cached.userId !== userId) return null;
  return cached.isPremium;
}

export function setCachedPremium(userId: string, isPremium: boolean): void {
  cached = { userId, isPremium };
}

export async function fetchPremiumStatus(userId: string): Promise<boolean> {
  const athleteResult = await supabase
    .from('athletes')
    .select('is_premium')
    .eq('user_id', userId)
    .maybeSingle();

  const isPremium = athleteResult.data?.is_premium === true;
  setCachedPremium(userId, isPremium);
  return isPremium;
}

/** Prefetch on app shell mount so PremiumGate tabs do not block on first paint. */
export async function warmPremiumCache(userId?: string): Promise<void> {
  const uid = userId ?? (await getAuthUserId());
  if (!uid) return;
  if (getCachedPremium(uid) !== null) return;
  await fetchPremiumStatus(uid);
}
