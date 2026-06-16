import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { supabase } from '@/services/supabase';

export async function isAthleteProfileComplete(userId: string): Promise<boolean> {
  const [byUserId, byId] = await Promise.all([
    supabase.from('athletes').select('id').eq('user_id', userId).not('username', 'is', null).maybeSingle(),
    supabase.from('athletes').select('id').eq('id', userId).not('username', 'is', null).maybeSingle(),
  ]);

  if (byUserId.error && byId.error) return false;
  return !!(byUserId.data?.id ?? byId.data?.id);
}

type ApplePersonName = {
  givenName?: string | null;
  familyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

function formatAppleDisplayName(name?: ApplePersonName | null): string | null {
  if (!name) return null;
  const given = (name.givenName ?? name.firstName ?? '').trim();
  const family = (name.familyName ?? name.lastName ?? '').trim();
  const full = [given, family].filter(Boolean).join(' ').trim();
  return full || null;
}

/** Link auth user to athletes row; seed display_name from Apple on first sign-in when missing. */
export async function bootstrapAthleteAfterAuth(
  userId: string,
  appleName?: ApplePersonName | null,
): Promise<{ error: { message: string } | null }> {
  const displayName = formatAppleDisplayName(appleName);

  const [byUserId, byId] = await Promise.all([
    supabase.from('athletes').select('id, display_name').eq('user_id', userId).maybeSingle(),
    supabase.from('athletes').select('id, display_name').eq('id', userId).maybeSingle(),
  ]);

  const existing = byUserId.data ?? byId.data;
  const lookupError = byUserId.error ?? byId.error;
  if (lookupError) {
    return { error: { message: lookupError.message } };
  }

  if (existing?.id) {
    await supabase.rpc('ensure_athlete_user_id', { p_athlete_id: existing.id });

    const hasDisplayName =
      typeof existing.display_name === 'string' && existing.display_name.trim().length > 0;
    if (!hasDisplayName && displayName) {
      const { error } = await supabase
        .from('athletes')
        .update({ display_name: displayName })
        .eq('id', existing.id);
      if (error) return { error: { message: error.message } };
    }

    return { error: null };
  }

  if (displayName) {
    const { error } = await supabase.from('athletes').upsert(
      { id: userId, user_id: userId, display_name: displayName },
      { onConflict: 'id' },
    );
    if (error) return { error: { message: error.message } };
    await supabase.rpc('ensure_athlete_user_id', { p_athlete_id: userId });
    return { error: null };
  }

  await resolveAthleteId(userId);
  return { error: null };
}
