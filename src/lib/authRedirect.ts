import { supabase } from '@/services/supabase';

/** Production origin — Despia's webview origin is localhost and cannot be used in emails. */
export const PRODUCTION_ORIGIN = 'https://rnkx.netlify.app';

/** Recovery emails must land on /auth so the set-new-password form can run in Safari. */
export const PASSWORD_RESET_REDIRECT_TO = `${PRODUCTION_ORIGIN}/auth`;

const RECOVERY_FLAG = 'rnkx_password_recovery';

export function urlIndicatesPasswordRecovery(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const search = new URLSearchParams(window.location.search);
  return hash.get('type') === 'recovery' || search.get('type') === 'recovery';
}

export function markPasswordRecovery(): void {
  try {
    sessionStorage.setItem(RECOVERY_FLAG, '1');
  } catch {
    // sessionStorage can throw in private Safari; URL detection still covers the first load.
  }
}

export function clearPasswordRecovery(): void {
  try {
    sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    // ignore
  }
}

export function hasPasswordRecoveryFlag(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_FLAG) === '1';
  } catch {
    return false;
  }
}

export async function sendPasswordResetEmail(email: string): Promise<{ error: Error | null }> {
  const trimmed = email.trim();
  if (!trimmed) return { error: new Error('Enter the email for your account.') };
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo: PASSWORD_RESET_REDIRECT_TO,
  });
  return { error };
}
