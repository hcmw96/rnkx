import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Resolve athletes.id from either athletes.id or legacy athletes.user_id (= auth.users.id). */
export async function resolveAthleteExternalId(
  supabase: SupabaseClient,
  idOrUserId: string,
): Promise<string | null> {
  const trimmed = idOrUserId.trim();
  if (!trimmed) return null;

  const { data: rows, error } = await supabase
    .from('athletes')
    .select('id')
    .or(`id.eq.${trimmed},user_id.eq.${trimmed}`)
    .limit(1);

  if (error) {
    console.error('[athleteLookup]', error);
    return null;
  }

  const athlete = (rows ?? [])[0] as { id?: string } | undefined;
  return athlete?.id ? String(athlete.id) : null;
}
