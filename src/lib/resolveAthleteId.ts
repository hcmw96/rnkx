import { supabase } from '@/services/supabase';

const ATHLETE_SESSION_COLUMNS = 'id, has_seen_welcome';

let cachedAuthUserId: string | null = null;
let cachedAthleteId: string | undefined;
let cachedHasSeenWelcome: boolean | null = null;
let inflight: Promise<string | undefined> | null = null;

export function clearAthleteIdCache(): void {
  cachedAuthUserId = null;
  cachedAthleteId = undefined;
  cachedHasSeenWelcome = null;
  inflight = null;
}

/** Welcome flag from the last resolveAthleteId hit for this auth user. Undefined if not cached. */
export function peekCachedHasSeenWelcome(authUserId: string): boolean | null | undefined {
  if (cachedAuthUserId !== authUserId || cachedAthleteId === undefined) return undefined;
  return cachedHasSeenWelcome;
}

/** Resolve athlete row id for the signed-in auth user (supports user_id or id = auth uid).
 *  Also self-heals athletes.user_id when the column is NULL (old schema rows). */
export async function resolveAthleteId(authUserId: string): Promise<string | undefined> {
  if (cachedAuthUserId === authUserId && cachedAthleteId !== undefined) {
    return cachedAthleteId;
  }

  if (inflight && cachedAuthUserId === authUserId) {
    return inflight;
  }

  cachedAuthUserId = authUserId;
  inflight = (async () => {
    const [byUserId, byId] = await Promise.all([
      supabase
        .from('athletes')
        .select(ATHLETE_SESSION_COLUMNS)
        .eq('user_id', authUserId)
        .not('username', 'is', null)
        .maybeSingle(),
      supabase
        .from('athletes')
        .select(ATHLETE_SESSION_COLUMNS)
        .eq('id', authUserId)
        .not('username', 'is', null)
        .maybeSingle(),
    ]);
    type Row = { id: string; has_seen_welcome: boolean | null };
    const row = (byUserId.data as Row | null) ?? (byId.data as Row | null);
    const athleteId = row?.id;

    if (athleteId) {
      cachedHasSeenWelcome = row?.has_seen_welcome ?? null;
      void supabase.rpc('ensure_athlete_user_id', { p_athlete_id: athleteId });
    } else {
      cachedHasSeenWelcome = null;
    }

    cachedAthleteId = athleteId;
    return athleteId;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
