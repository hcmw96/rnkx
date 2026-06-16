import { bootstrapAthleteAfterAuth } from '@/lib/authPostLogin';
import { supabase } from '@/services/supabase';

const APPLE_CLIENT_ID = 'com.despia.rnkx.web';
const APPLE_REDIRECT_URI = 'https://rnkx.netlify.app/';

export function isDespiaIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('despia') && (ua.includes('iphone') || ua.includes('ipad'));
}

function generateRawNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isUserCancelledError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const candidates = [record.error, record.message, record.code];
  return candidates.some(
    (value) => typeof value === 'string' && value.toLowerCase().includes('popup_closed_by_user'),
  );
}

export type AppleSignInResult = {
  error: { message: string } | null;
  cancelled?: boolean;
};

export async function signInWithApple(): Promise<AppleSignInResult> {
  if (!isDespiaIOS()) {
    return { error: { message: 'Sign in with Apple is only available on the RNKX iOS app.' } };
  }

  if (!window.AppleID?.auth) {
    return { error: { message: 'Apple Sign In is not available. Please try again.' } };
  }

  try {
    const rawNonce = generateRawNonce();
    const hashedNonce = await sha256Hex(rawNonce);

    window.AppleID.auth.init({
      clientId: APPLE_CLIENT_ID,
      scope: 'name email',
      redirectURI: APPLE_REDIRECT_URI,
      usePopup: true,
      nonce: hashedNonce,
    });

    const response = await window.AppleID.auth.signIn();
    const idToken = response.authorization?.id_token;
    if (!idToken) {
      return { error: { message: 'Apple Sign In did not return an identity token.' } };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
      nonce: rawNonce,
    });

    if (error) {
      return { error: { message: error.message } };
    }

    const userId = data.user?.id ?? data.session?.user?.id;
    if (!userId) {
      return { error: { message: 'Signed in with Apple but no user session was created.' } };
    }

    const bootstrap = await bootstrapAthleteAfterAuth(userId, response.user?.name ?? null);
    if (bootstrap.error) {
      return bootstrap;
    }

    return { error: null };
  } catch (error) {
    if (isUserCancelledError(error)) {
      return { error: null, cancelled: true };
    }

    const message =
      error instanceof Error ? error.message : 'Something went wrong with Apple Sign In.';
    return { error: { message } };
  }
}
