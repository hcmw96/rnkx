import { supabase } from '@/services/supabase';

/** Resolve athlete row id for the signed-in auth user (supports user_id or id = auth uid).
 *  Also self-heals athletes.user_id when the column is NULL (old schema rows). */
export async function resolveAthleteId(authUserId: string): Promise<string | undefined> {
  const [byUserId, byId] = await Promise.all([
    supabase.from('athletes').select('id').eq('user_id', authUserId).not('username', 'is', null).maybeSingle(),
    supabase.from('athletes').select('id').eq('id', authUserId).not('username', 'is', null).maybeSingle(),
  ]);
  const athleteId = (byUserId.data?.id ?? byId.data?.id) as string | undefined;

  if (athleteId) {
    await supabase.rpc('ensure_athlete_user_id', { p_athlete_id: athleteId });
  }

  return athleteId;
}
