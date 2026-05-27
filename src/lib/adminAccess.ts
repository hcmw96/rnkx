import { supabase } from '@/services/supabase';

export const ADMIN_STORAGE_KEY = 'rnkx_admin_auth';
export const ADMIN_PASSWORD = 'rnkx_admin_2026';

/** Usernames that may open /admin without the shared password (still must be signed in). */
export const ADMIN_USERNAMES = new Set(['sds8', 'henry', 'henryw']);

export function isAdminPasswordSession(): boolean {
  try {
    return localStorage.getItem(ADMIN_STORAGE_KEY) === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

export function setAdminPasswordSession(): void {
  try {
    localStorage.setItem(ADMIN_STORAGE_KEY, ADMIN_PASSWORD);
  } catch {
    /* ignore */
  }
}

export async function resolveCurrentUsername(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const uid = user.id;
  const [byUserId, byId] = await Promise.all([
    supabase.from('athletes').select('username').eq('user_id', uid).maybeSingle(),
    supabase.from('athletes').select('username').eq('id', uid).maybeSingle(),
  ]);

  const row = byUserId.data ?? byId.data;
  const username = row?.username;
  return typeof username === 'string' && username.trim() ? username.trim().toLowerCase() : null;
}

export function isAllowlistedAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return ADMIN_USERNAMES.has(username.trim().toLowerCase());
}

export async function hasAdminUiAccess(): Promise<boolean> {
  if (isAdminPasswordSession()) return true;
  const username = await resolveCurrentUsername();
  return isAllowlistedAdminUsername(username);
}
