import { bootstrapAthleteAfterAuth } from '@/lib/authPostLogin';
import { supabase } from '@/services/supabase';

const APPLE_CLIENT_ID = 'com.despia.rnkx.web';
const APPLE_REDIRECT_URI = 'https://rnkx.netlify.app/';
const APPLE_SDK_URL =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

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

export type AppleSignInResult = {
  error: { message: string } | null;
  cancelled?: boolean;
};

type AppleAuthSuccess = {
  authorization: {
    id_token: string;
    code?: string;
    state?: string;
  };
  user?: {
    name?: {
      firstName?: string;
      lastName?: string;
      givenName?: string;
      familyName?: string;
    };
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

/**
 * On Despia iOS (usePopup: false) signIn() often resolves undefined — credentials arrive via DOM events.
 * @see https://developer.apple.com/videos/play/wwdc2022/10122/
 */
function requestAppleAuthorization(hashedNonce: string): Promise<AppleAuthSuccess> {
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
    }, 120_000);

    // Despia iOS WebView: usePopup must be false — popups are blocked; native Face ID dialog is used instead.
    window.AppleID.auth.init({
      clientId: APPLE_CLIENT_ID,
      scope: 'name email',
      redirectURI: APPLE_REDIRECT_URI,
      usePopup: false,
      nonce: hashedNonce,
    });

    void window.AppleID.auth.signIn().then((response) => {
      const parsed = parseAppleSuccessDetail(response);
      if (parsed) finish(() => resolve(parsed));
      // Otherwise wait for AppleIDSignInOnSuccess — signIn() may resolve undefined on iOS.
    }).catch((error) => {
      // SDK may reject internally; the DOM event can still deliver credentials.
      console.warn('[Apple Sign In] signIn promise rejected', error);
    });
  });
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  if (!isDespiaIOS()) {
    return { error: { message: 'Sign in with Apple is only available on the RNKX iOS app.' } };
  }

  try {
    await loadAppleAuthSdk();

    const rawNonce = generateRawNonce();
    const hashedNonce = await sha256Hex(rawNonce);

    const response = await requestAppleAuthorization(hashedNonce);
    const idToken = response?.authorization?.id_token;
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

    console.error('[Apple Sign In]', error);
    return { error: { message: getAppleAuthErrorMessage(error) } };
  }
}
