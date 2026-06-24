import { clearAthleteIdCache } from '@/lib/resolveAthleteId';
import { supabase } from '@/services/supabase';

export const ADMIN_STORAGE_KEY = 'rnkx_admin_auth';
export const ADMIN_PASSWORD = 'rnkx_admin_2026';

/** Usernames that may use admin (must match Postgres admin_is_caller_allowed). */
export const ADMIN_USERNAMES = new Set(['sds8', 'shaunsmith', 'henry', 'henryw']);

/** Auth emails that may use admin (must match Postgres admin_is_caller_allowed). */
export const ADMIN_EMAILS = new Set(['shaun@hsmithplc.com']);

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

async function resolveAthleteForCaller(
  authUserId: string,
): Promise<{ athleteId: string | null; username: string | null }> {
  const { data: rows } = await supabase
    .from('athletes')
    .select('id, username')
    .or(`user_id.eq.${authUserId},id.eq.${authUserId}`);

  if (!rows?.length) return { athleteId: null, username: null };

  const allowlisted = rows.find((row) => isAllowlistedAdminUsername(row.username));
  const pick = allowlisted ?? rows[0];
  const username =
    typeof pick.username === 'string' && pick.username.trim() ? pick.username.trim().toLowerCase() : null;
  return { athleteId: pick.id, username };
}

export async function resolveCurrentUsername(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { username } = await resolveAthleteForCaller(user.id);
  return username;
}

export function isAllowlistedAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return ADMIN_USERNAMES.has(username.trim().toLowerCase());
}

export function isAllowlistedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

export function isAllowlistedAdminCaller(
  username: string | null | undefined,
  email: string | null | undefined,
): boolean {
  return isAllowlistedAdminUsername(username) || isAllowlistedAdminEmail(email);
}

/** Link auth user to athlete row and verify server-side allowlist will accept them. */
export async function prepareAdminAccess(): Promise<{
  ok: boolean;
  username: string | null;
  email: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, username: null, email: null };

  let { athleteId, username } = await resolveAthleteForCaller(user.id);

  if (athleteId) {
    await supabase.rpc('ensure_athlete_user_id', { p_athlete_id: athleteId });
  } else {
    const { error: linkErr } = await supabase.rpc('link_allowlisted_athlete_for_caller');
    if (linkErr) {
      console.warn('[admin] link_allowlisted_athlete_for_caller', linkErr.message);
    }
    clearAthleteIdCache();
    ({ athleteId, username } = await resolveAthleteForCaller(user.id));
    if (athleteId) {
      await supabase.rpc('ensure_athlete_user_id', { p_athlete_id: athleteId });
      const refreshed = await resolveAthleteForCaller(user.id);
      athleteId = refreshed.athleteId;
      username = refreshed.username;
    }
  }

  const email = user.email?.trim().toLowerCase() ?? null;
  const ok =
    isAllowlistedAdminEmail(email) ||
    (isAllowlistedAdminUsername(username) && athleteId != null);
  return { ok, username, email };
}

/** Sign in with RNKX credentials, then link allowlisted athlete profile if needed. */
export async function signInForAdminAccess(
  email: string,
  password: string,
): Promise<{ ok: boolean; username: string | null; error: string | null }> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) {
    return { ok: false, username: null, error: 'Enter your RNKX email and password.' };
  }

  clearAthleteIdCache();
  clearAdminPasswordSession();

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });
  if (signInErr) {
    return { ok: false, username: null, error: signInErr.message };
  }

  const { ok, username, email } = await prepareAdminAccess();
  if (!ok) {
    return {
      ok: false,
      username,
      error:
        username && !isAllowlistedAdminCaller(username, email)
          ? `Signed in as @${username}, but that account is not on the admin allowlist.`
          : 'Signed in, but your account is not on the admin allowlist. Contact support if this is unexpected.',
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) setAdminPasswordSession(user.id);

  return { ok: true, username, error: null };
}

export async function hasAdminUiAccess(): Promise<boolean> {
  const { ok } = await prepareAdminAccess();
  return ok;
}
