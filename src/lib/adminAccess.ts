import { clearAthleteIdCache, resolveAthleteId } from '@/lib/resolveAthleteId';
import { supabase } from '@/services/supabase';

export const ADMIN_STORAGE_KEY = 'rnkx_admin_auth';
export const ADMIN_PASSWORD = 'rnkx_admin_2026';

/** Usernames that may use admin (must match Postgres admin_is_caller_allowed). */
export const ADMIN_USERNAMES = new Set(['sds8', 'henry', 'henryw']);

function adminSessionKey(authUserId: string): string {
  return `${ADMIN_PASSWORD}:${authUserId}`;
}

export function isAdminPasswordSession(authUserId: string): boolean {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (raw === adminSessionKey(authUserId)) return true;
    // Legacy: password-only session (ignore — must re-verify per user)
    if (raw === ADMIN_PASSWORD) {
      localStorage.removeItem(ADMIN_STORAGE_KEY);
    }
    return false;
  } catch {
    return false;
  }
}

export function setAdminPasswordSession(authUserId: string): void {
  try {
    localStorage.setItem(ADMIN_STORAGE_KEY, adminSessionKey(authUserId));
  } catch {
    /* ignore */
  }
}

export function clearAdminPasswordSession(): void {
  try {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function resolveCurrentUsername(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const athleteId = await resolveAthleteId(user.id);
  if (!athleteId) return null;

  const { data } = await supabase.from('athletes').select('username').eq('id', athleteId).maybeSingle();
  const username = data?.username;
  return typeof username === 'string' && username.trim() ? username.trim().toLowerCase() : null;
}

export function isAllowlistedAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return ADMIN_USERNAMES.has(username.trim().toLowerCase());
}

/** Link auth user to athlete row and verify server-side allowlist will accept them. */
export async function prepareAdminAccess(): Promise<{ ok: boolean; username: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, username: null };

  let athleteId = await resolveAthleteId(user.id);
  if (athleteId) {
    await supabase.rpc('ensure_athlete_user_id', { p_athlete_id: athleteId });
  } else {
    const { error: linkErr } = await supabase.rpc('link_allowlisted_athlete_for_caller');
    if (linkErr) {
      console.warn('[admin] link_allowlisted_athlete_for_caller', linkErr.message);
    }
    clearAthleteIdCache();
    athleteId = await resolveAthleteId(user.id);
    if (athleteId) {
      await supabase.rpc('ensure_athlete_user_id', { p_athlete_id: athleteId });
    }
  }

  const username = await resolveCurrentUsername();
  const ok = isAllowlistedAdminUsername(username) && athleteId != null;
  return { ok, username };
}

export async function hasAdminUiAccess(): Promise<boolean> {
  const { ok } = await prepareAdminAccess();
  return ok;
}
