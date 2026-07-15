import { bootstrapAthleteAfterAuth, isAthleteProfileComplete } from '@/lib/authPostLogin';
import { supabase } from '@/services/supabase';

const APPLE_CLIENT_ID = 'com.despia.rnkx.web';
/**
 * Must match a Return URL on Services ID `com.despia.rnkx.web`.
 * Required even with usePopup:true. Prefer site root (Despia + Supabase docs).
 */
const APPLE_REDIRECT_URI = 'https://rnkx.netlify.app/';
const APPLE_SDK_URL =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
const APPLE_NONCE_STORAGE_KEY = 'rnkx_apple_auth_nonce';
const APPLE_AUTH_TIMEOUT_MS = 120_000;

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
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function persistAppleNonce(rawNonce: string): void {
  try {
    sessionStorage.setItem(APPLE_NONCE_STORAGE_KEY, rawNonce);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(APPLE_NONCE_STORAGE_KEY, rawNonce);
  } catch {
    // ignore
  }
}

function readAppleNonce(): string | null {
  try {
    const fromSession = sessionStorage.getItem(APPLE_NONCE_STORAGE_KEY);
    if (fromSession) return fromSession;
  } catch {
    // ignore
  }
  try {
    return localStorage.getItem(APPLE_NONCE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearAppleNonce(): void {
  try {
    sessionStorage.removeItem(APPLE_NONCE_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(APPLE_NONCE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

const APPLE_CANCEL_ERRORS = new Set([
  'popup_closed_by_user',
  'user_cancelled_authorize',
  'user_canceled_authorize',
]);

function collectErrorCandidates(error: unknown): string[] {
  const out: string[] = [];
  if (typeof error === 'string' && error.trim()) out.push(error.trim());
  if (error instanceof Error && error.message) out.push(error.message);
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    for (const key of ['error', 'message', 'code', 'error_description', 'name']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) out.push(value.trim());
      if (value && typeof value === 'object') {
        const nested = value as Record<string, unknown>;
        for (const nestedKey of ['error', 'message', 'code']) {
          const nestedVal = nested[nestedKey];
          if (typeof nestedVal === 'string' && nestedVal.trim()) out.push(nestedVal.trim());
        }
      }
    }
  }
  return out;
}

function isUserCancelledError(error: unknown): boolean {
  return collectErrorCandidates(error).some((value) => {
    const normalized = value.toLowerCase();
    return (
      APPLE_CANCEL_ERRORS.has(normalized) ||
      normalized.includes('popup_closed_by_user') ||
      normalized.includes('cancel')
    );
  });
}

function getAppleAuthErrorMessage(error: unknown): string {
  const candidates = collectErrorCandidates(error);
  for (const value of candidates) {
    const normalized = value.toLowerCase();
    switch (normalized) {
      case 'popup_blocked_by_browser':
        return 'Apple Sign In was blocked. Please try again.';
      case 'invalid_client':
      case 'invalid_request':
        return 'Apple Sign In is misconfigured. Please try again later.';
      default:
        break;
    }
    if (normalized.includes('unacceptable audience')) {
      return 'Apple Sign In is not configured in Supabase yet. Add com.despia.rnkx.web to Authentication → Providers → Apple → Client IDs.';
    }
    if (normalized.includes('nonce')) {
      return 'Apple Sign In session expired. Please try again.';
    }
  }

  if (candidates.length > 0) {
    const primary = candidates[0];
    // Surface Apple/Supabase codes clearly for TestFlight debugging.
    if (/^[a-z0-9_.-]+$/i.test(primary) && primary.length < 64) {
      return `Apple Sign In failed (${primary}).`;
    }
    return primary;
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}' && serialized !== 'null') {
      return `Apple Sign In failed: ${serialized.slice(0, 160)}`;
    }
  } catch {
    // ignore
  }

  return 'Something went wrong with Apple Sign In.';
}

type ApplePersonName = {
  firstName?: string;
  lastName?: string;
  givenName?: string;
  familyName?: string;
};

type AppleAuthSuccess = {
  authorization: {
    id_token: string;
    code?: string;
    state?: string;
  };
  user?: {
    name?: ApplePersonName;
  };
};

function parseAppleSuccessDetail(detail: unknown): AppleAuthSuccess | null {
  if (!detail || typeof detail !== 'object') return null;
  const record = detail as Record<string, unknown>;

  const authFromDetail = record.authorization;
  if (authFromDetail && typeof authFromDetail === 'object') {
    const auth = authFromDetail as Record<string, unknown>;
    if (typeof auth.id_token === 'string') {
      return {
        authorization: auth as AppleAuthSuccess['authorization'],
        user: record.user as AppleAuthSuccess['user'],
      };
    }
  }

  // Some SDK shapes put id_token on the root.
  if (typeof record.id_token === 'string') {
    return {
      authorization: {
        id_token: record.id_token,
        code: typeof record.code === 'string' ? record.code : undefined,
        state: typeof record.state === 'string' ? record.state : undefined,
      },
      user: record.user as AppleAuthSuccess['user'],
    };
  }

  const data = record.data;
  if (data && typeof data === 'object') {
    const dataRecord = data as Record<string, unknown>;
    const nestedAuth = dataRecord.authorization ?? dataRecord;
    if (nestedAuth && typeof nestedAuth === 'object') {
      const auth = nestedAuth as Record<string, unknown>;
      if (typeof auth.id_token === 'string') {
        return {
          authorization: auth as AppleAuthSuccess['authorization'],
          user: (dataRecord.user ?? record.user) as AppleAuthSuccess['user'],
        };
      }
    }
  }

  return null;
}

function parseAppleUserParam(raw: string | null): ApplePersonName | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { name?: ApplePersonName };
    return parsed.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Despia iOS: usePopup MUST be true — native Face ID / Apple ID sheet, id_token to JS.
 * Apple JS SDK hashes the nonce itself — pass the RAW nonce (Supabase web docs).
 * @see https://supabase.com/docs/guides/auth/social-login/auth-apple
 * @see https://setup.despia.com/native-features/oauth/apple
 */
function requestAppleAuthorization(rawNonce: string): Promise<AppleAuthSuccess> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const cleanup = () => {
      document.removeEventListener('AppleIDSignInOnSuccess', onSuccess);
      document.removeEventListener('AppleIDSignInOnFailure', onFailure);
      window.clearTimeout(timeoutId);
    };

    const onSuccess = (event: Event) => {
      const parsed = parseAppleSuccessDetail((event as CustomEvent).detail);
      if (parsed) {
        finish(() => resolve(parsed));
        return;
      }
      finish(() => reject(new Error('Apple Sign In returned an unexpected response.')));
    };

    const onFailure = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      finish(() => reject(detail?.error ?? detail ?? new Error('Apple Sign In failed.')));
    };

    document.addEventListener('AppleIDSignInOnSuccess', onSuccess);
    document.addEventListener('AppleIDSignInOnFailure', onFailure);

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error('Apple Sign In timed out. Please try again.')));
    }, APPLE_AUTH_TIMEOUT_MS);

    window.AppleID.auth.init({
      clientId: APPLE_CLIENT_ID,
      scope: 'name email',
      redirectURI: APPLE_REDIRECT_URI,
      usePopup: true,
      // RAW nonce — Apple JS SDK hashes before putting it in the id_token.
      nonce: rawNonce,
    });

    const signIn = window.AppleID?.auth?.signIn;
    if (typeof signIn !== 'function') {
      finish(() => reject(new Error('Apple Sign In is not available. Please try again.')));
      return;
    }

    try {
      const result = signIn.call(window.AppleID.auth) as unknown;
      if (result != null && typeof (result as Promise<unknown>).then === 'function') {
        void (result as Promise<unknown>)
          .then((response) => {
            const parsed = parseAppleSuccessDetail(response);
            if (parsed) {
              finish(() => resolve(parsed));
              return;
            }
            // Some WebViews resolve without a payload — DOM success event may still fire.
          })
          .catch((error) => {
            if (isUserCancelledError(error)) {
              finish(() => reject(error));
              return;
            }
            if (!settled) {
              console.warn('[Apple Sign In] signIn promise rejected', error);
              finish(() => reject(error));
            }
          });
      }
    } catch (error) {
      if (isUserCancelledError(error)) {
        finish(() => reject(error));
        return;
      }
      console.warn('[Apple Sign In] signIn threw', error);
      finish(() => reject(error));
    }
  });
}

function mapSupabaseAppleAuthError(message: string): string {
  if (message.includes('Unacceptable audience')) {
    return 'Apple Sign In is not configured in Supabase yet. Add com.despia.rnkx.web to Authentication → Providers → Apple → Client IDs.';
  }
  if (/nonce/i.test(message)) {
    return 'Apple Sign In session expired. Please try again.';
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

  clearAppleNonce();

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

  const profileComplete = await isAthleteProfileComplete(userId);
  return { error: null, userId, profileComplete };
}

export type AppleSignInResult = {
  error: { message: string } | null;
  cancelled?: boolean;
  userId?: string;
  profileComplete?: boolean;
};

/**
 * Opens the native Apple sheet on Despia iOS (usePopup: true) and completes sign-in
 * from the JS callback — no page redirect.
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  if (!isDespiaIOS()) {
    return { error: { message: 'Sign in with Apple is only available on the RNKX iOS app.' } };
  }

  let rawNonce: string | null = null;

  try {
    await loadAppleAuthSdk();

    rawNonce = generateRawNonce();
    persistAppleNonce(rawNonce);

    const response = await requestAppleAuthorization(rawNonce);
    const idToken = response.authorization.id_token;
    if (!idToken) {
      clearAppleNonce();
      return { error: { message: 'Apple Sign In did not return an identity token.' } };
    }

    return await finishAppleSession(idToken, rawNonce, response.user?.name ?? null);
  } catch (error) {
    clearAppleNonce();
    if (isUserCancelledError(error)) {
      return { error: null, cancelled: true };
    }

    console.error('[Apple Sign In]', error);
    return { error: { message: getAppleAuthErrorMessage(error) } };
  }
}

/** Fallback if Apple ever form_posts (legacy); primary path is in-page popup. */
export async function completeAppleSignInFromRedirect(
  searchParams: URLSearchParams,
): Promise<AppleSignInResult> {
  const appleError = searchParams.get('error');
  if (appleError) {
    clearAppleNonce();
    return { error: { message: `Apple Sign In failed (${appleError}).` } };
  }

  const idToken = searchParams.get('id_token');
  if (!idToken) {
    clearAppleNonce();
    return { error: { message: 'Apple Sign In did not return an identity token.' } };
  }

  const rawNonce = readAppleNonce();
  if (!rawNonce) {
    return { error: { message: 'Apple Sign In session expired. Please try again.' } };
  }

  try {
    return await finishAppleSession(idToken, rawNonce, parseAppleUserParam(searchParams.get('user')));
  } catch (error) {
    clearAppleNonce();
    console.error('[Apple Sign In] complete redirect', error);
    return { error: { message: getAppleAuthErrorMessage(error) } };
  }
}
