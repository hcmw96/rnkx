import { supabase } from '@/services/supabase';

/** Resolve athlete row id for the signed-in auth user (supports user_id or id = auth uid).
 *  Also self-heals athletes.user_id when the column is NULL (old schema rows). */
export async function resolveAthleteId(authUserId: string): Promise<string | undefined> {
  const [byUserId, byId] = await Promise.all([
    supabase.from('athletes').select('id').eq('user_id', authUserId).not('username', 'is', null).maybeSingle(),
    supabase.from('athletes').select('id').eq('id', authUserId).not('username', 'is', null).maybeSingle(),
  ]);
  const athleteId = (byUserId.data?.id ?? byId.data?.id) as string | undefined;

  // Self-heal: if found via id = auth uid but user_id is still NULL, backfill it so RLS works
  if (athleteId && !byUserId.data?.id && byId.data?.id) {
    await supabase
      .from('athletes')
      .update({ user_id: authUserId })
      .eq('id', athleteId)
      .is('user_id', null);
  }

  return athleteId;
}
