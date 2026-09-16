import {
  hasPasswordRecoveryFlag,
  urlIndicatesPasswordRecovery,
} from '@/lib/authRedirect';
import { isDespiaNative } from '@/services/onesignal';

/** App Store listing for RNKX — Global Fitness Leagues (`com.despia.rnkxglobal`). */
export const APP_STORE_URL =
  'https://apps.apple.com/app/rnkx-global-fitness-leagues/id6783303747';

/**
 * Safari-only surfaces that must keep working outside Despia:
 * App Store / GDPR legal docs, WHOOP + Apple OAuth returns, password-reset emails.
 */
export function isPublicWebPath(pathname: string): boolean {
  if (
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/waiver' ||
    pathname === '/cookies' ||
    pathname === '/auth/whoop/callback' ||
    pathname === '/auth/apple/complete' ||
    pathname === '/whoop-callback'
  ) {
    return true;
  }
  if (pathname === '/auth') {
    return urlIndicatesPasswordRecovery() || hasPasswordRecoveryFlag();
  }
  return false;
}

/** The in-app experience runs in Despia. Vite `npm run dev` stays in Chrome for local work. */
export function shouldServeNativeApp(): boolean {
  if (isDespiaNative()) return true;
  if (import.meta.env.DEV) return true;
  return false;
}
