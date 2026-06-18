import { bootstrapAthleteAfterAuth } from '@/lib/authPostLogin';
import { supabase } from '@/services/supabase';

const APPLE_CLIENT_ID = 'com.despia.rnkx.web';
/** Apple form_post target — must match a Return URL on Services ID com.despia.rnkx.web */
const APPLE_POST_CALLBACK_URI = 'https://rnkx.netlify.app/api/auth/apple/callback';
const APPLE_SDK_URL =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
const APPLE_NONCE_STORAGE_KEY = 'rnkx_apple_auth_nonce';

let appleSdkPromise: Promise<void> | null = null;

/** Load Apple JS SDK on demand — do not block app boot with a synchronous <head> script. */
export function loadAppleAuthSdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Apple Sign In is not available in this environment.'));
  }
  if (window.AppleID?.auth) return Promise.resolve();
  if (appleSdkPromise) return appleSdkPromise;

  appleSdkPromise = new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (window.AppleID?.auth) resolve();
      else reject(new Error('Apple Sign In SDK loaded but AppleID.auth is missing.'));
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_SDK_URL}"]`);
    if (existing) {
      if (window.AppleID?.auth) {
        resolve();
        return;
      }
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Apple Sign In SDK failed to load.')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = APPLE_SDK_URL;
    script.async = true;
    script.onload = finish;
    script.onerror = () => reject(new Error('Apple Sign In SDK failed to load.'));
    document.head.appendChild(script);
  });

  return appleSdkPromise.catch((error) => {
    appleSdkPromise = null;
    throw error;
  });
}

/** Despia iOS WebView — matches `despia-iphone` / `despia-ipad` UA tokens from Despia docs. */
export function isDespiaIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('despia-iphone') || ua.includes('despia-ipad')) return true;
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

const APPLE_CANCEL_ERRORS = new Set([
  'popup_closed_by_user',
  'user_cancelled_authorize',
  'user_canceled_authorize',
]);

function isUserCancelledError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const candidates = [record.error, record.message, record.code];
  return candidates.some((value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.toLowerCase();
    return (
      APPLE_CANCEL_ERRORS.has(normalized) ||
      normalized.includes('popup_closed_by_user') ||
      normalized.includes('cancel')
    );
  });
}

function getAppleAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.error === 'string') {
      switch (record.error) {
        case 'popup_blocked_by_browser':
          return 'Apple Sign In was blocked by the browser. Please try again.';
        case 'invalid_request':
          return 'Apple Sign In configuration is invalid. Check Services ID and redirect URL.';
        default:
          return `Apple Sign In failed (${record.error}).`;
      }
    }
    if (typeof record.message === 'string' && record.message) return record.message;
  }
  return 'Something went wrong with Apple Sign In.';
}

type ApplePersonName = {
  firstName?: string;
  lastName?: string;
  givenName?: string;
  familyName?: string;
};

function parseAppleUserParam(raw: string | null): ApplePersonName | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { name?: ApplePersonName };
    return parsed.name ?? null;
  } catch {
    return null;
  }
}

/** signIn() is void in Despia WebView — never chain .then directly. */
function invokeAppleSignIn(): void {
  const signIn = window.AppleID?.auth?.signIn;
  if (typeof signIn !== 'function') {
    throw new Error('Apple Sign In is not available. Please try again.');
  }

  try {
    const result = signIn.call(window.AppleID.auth) as unknown;
    if (result != null && typeof (result as Promise<unknown>).then === 'function') {
      void (result as Promise<unknown>).catch((error) => {
        console.warn('[Apple Sign In] signIn promise rejected', error);
      });
    }
  } catch (error) {
    if (!isUserCancelledError(error)) {
      console.warn('[Apple Sign In] signIn threw', error);
    }
    throw error;
  }
}

function mapSupabaseAppleAuthError(message: string): string {
  if (message.includes('Unacceptable audience')) {
    return 'Apple Sign In is not configured in Supabase yet. Add com.despia.rnkx.web to Authentication → Providers → Apple → Client IDs.';
  }
  return message;
}

async function finishAppleSession(
  idToken: string,
  rawNonce: string,
  appleName: ApplePersonName | null,
): Promise<AppleSignInResult> {
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
    nonce: rawNonce,
  });

  sessionStorage.removeItem(APPLE_NONCE_STORAGE_KEY);

  if (error) {
    return { error: { message: mapSupabaseAppleAuthError(error.message) } };
  }

  const userId = data.user?.id ?? data.session?.user?.id;
  if (!userId) {
    return { error: { message: 'Signed in with Apple but no user session was created.' } };
  }

  const bootstrap = await bootstrapAthleteAfterAuth(userId, appleName);
  if (bootstrap.error) {
    return bootstrap;
  }

  return { error: null, userId };
}

export type AppleSignInResult = {
  error: { message: string } | null;
  cancelled?: boolean;
  /** Native sheet opened; page will redirect to complete auth. */
  redirecting?: boolean;
  userId?: string;
};

/**
 * Opens the native Apple sheet. With usePopup: false, Apple POSTs to our Netlify callback after Continue.
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  if (!isDespiaIOS()) {
    return { error: { message: 'Sign in with Apple is only available on the RNKX iOS app.' } };
  }

  try {
    await loadAppleAuthSdk();

    const rawNonce = generateRawNonce();
    const hashedNonce = await sha256Hex(rawNonce);
    sessionStorage.setItem(APPLE_NONCE_STORAGE_KEY, rawNonce);

    window.AppleID.auth.init({
      clientId: APPLE_CLIENT_ID,
      scope: 'name email',
      redirectURI: APPLE_POST_CALLBACK_URI,
      usePopup: false,
      nonce: hashedNonce,
    });

    invokeAppleSignIn();
    return { error: null, redirecting: true };
  } catch (error) {
    sessionStorage.removeItem(APPLE_NONCE_STORAGE_KEY);
    if (isUserCancelledError(error)) {
      return { error: null, cancelled: true };
    }

    console.error('[Apple Sign In]', error);
    return { error: { message: getAppleAuthErrorMessage(error) } };
  }
}

/** Called from /auth/apple/complete after Netlify forwards Apple's form_post as a GET redirect. */
export async function completeAppleSignInFromRedirect(
  searchParams: URLSearchParams,
): Promise<AppleSignInResult> {
  const appleError = searchParams.get('error');
  if (appleError) {
    sessionStorage.removeItem(APPLE_NONCE_STORAGE_KEY);
    return { error: { message: `Apple Sign In failed (${appleError}).` } };
  }

  const idToken = searchParams.get('id_token');
  if (!idToken) {
    sessionStorage.removeItem(APPLE_NONCE_STORAGE_KEY);
    return { error: { message: 'Apple Sign In did not return an identity token.' } };
  }

  const rawNonce = sessionStorage.getItem(APPLE_NONCE_STORAGE_KEY);
  if (!rawNonce) {
    return { error: { message: 'Apple Sign In session expired. Please try again.' } };
  }

  try {
    return await finishAppleSession(idToken, rawNonce, parseAppleUserParam(searchParams.get('user')));
  } catch (error) {
    sessionStorage.removeItem(APPLE_NONCE_STORAGE_KEY);
    console.error('[Apple Sign In] complete redirect', error);
    return { error: { message: getAppleAuthErrorMessage(error) } };
  }
}
