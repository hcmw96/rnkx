import { useCallback, useEffect, useState } from 'react';
import despia from 'despia-native';
import { getAuthUserId } from '@/lib/authSession';
import {
  fetchPremiumStatus,
  getCachedPremium,
  setCachedPremium,
  subscribePremiumCache,
} from '@/lib/premiumCache';
import { supabase } from '@/services/supabase';
import { REVENUECAT_ENTITLEMENT_ID } from '../../supabase/functions/_shared/revenuecat';

/** RevenueCat offering identifier — must match dashboard exactly. */
export const REVENUECAT_OFFERING_ID = 'RNKXPREMIUM_MONTHLY';

export { REVENUECAT_ENTITLEMENT_ID };

export async function checkPremium(): Promise<boolean> {
  const userId = await getAuthUserId();
  if (!userId) {
    return false;
  }

  const cached = getCachedPremium(userId);
  if (cached !== null) return cached;

  return fetchPremiumStatus(userId);
}

export async function checkEntitlements(): Promise<boolean> {
  const isDespiaApp = navigator.userAgent.toLowerCase().includes('despia');
  if (!isDespiaApp) return false;
  try {
    const data = await despia('getpurchasehistory://', ['restoredData']);
    const active = ((data as { restoredData?: { isActive?: boolean; entitlementId?: string }[] }).restoredData ?? []).filter(
      (p) => p.isActive,
    );
    return active.some((p) => p.entitlementId === REVENUECAT_ENTITLEMENT_ID);
  } catch {
    return false;
  }
}

/** If RevenueCat reports an active premium entitlement, persist it on the athlete row. */
export async function applyPremiumIfStoreHasEntitlement(): Promise<boolean> {
  const isPremium = await checkEntitlements();
  if (!isPremium) return false;
  const userId = await getAuthUserId();
  if (userId) {
    await supabase.from('athletes').update({ is_premium: true }).eq('user_id', userId);
    setCachedPremium(userId, true);
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Polls the check-entitlement edge function until premium is active (or attempts exhausted).
 * Used after a native IAP success callback.
 */
export async function pollCheckEntitlementUntilPremium(options?: {
  maxAttempts?: number;
  intervalMs?: number;
}): Promise<boolean> {
  const maxAttempts = options?.maxAttempts ?? 12;
  const intervalMs = options?.intervalMs ?? 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await supabase.functions.invoke<{ isPremium?: boolean }>('check-entitlement', {
      body: {},
    });
    if (!error && data?.isPremium === true) {
      const userId = await getAuthUserId();
      if (userId) setCachedPremium(userId, true);
      return true;
    }
    if (attempt < maxAttempts - 1) await sleep(intervalMs);
  }
  return false;
}

function isDespiaRuntime(): boolean {
  return navigator.userAgent.toLowerCase().includes('despia');
}

/**
 * Single entry point for the native RevenueCat paywall.
 * Always passes offering=RNKXPREMIUM_MONTHLY (never the RC default fallback).
 */
export function launchNativePaywall(userId: string): void {
  if (!isDespiaRuntime()) {
    window.location.href = '/premium';
    return;
  }
  void despia(
    `revenuecat://launchPaywall?external_id=${encodeURIComponent(userId)}&offering=${encodeURIComponent(REVENUECAT_OFFERING_ID)}`,
  );
}

/**
 * Sync premium from RevenueCat via the check-entitlement edge function.
 * Updates the local premium cache so PremiumGate / settings refresh without relaunch.
 * On invoke failure (offline, 5xx, etc.) returns 'error' and does not touch the cache —
 * callers must treat that as fail-open so paying users are not locked out.
 */
export async function syncEntitlementFromServer(): Promise<'premium' | 'none' | 'error'> {
  const { data, error } = await supabase.functions.invoke<{ isPremium?: boolean }>('check-entitlement', {
    body: {},
  });
  if (error) return 'error';

  const isPremium = data?.isPremium === true;
  const userId = await getAuthUserId();
  if (userId) setCachedPremium(userId, isPremium);
  return isPremium ? 'premium' : 'none';
}

/**
 * Despia restore: `getpurchasehistory://` is the documented native restore
 * (`revenuecat://restore` does not exist in despia-native). Then re-sync via
 * check-entitlement so the athlete row + premium cache match RevenueCat.
 */
export async function restoreInAppPurchasesAndApplyPremium(): Promise<
  'premium' | 'none' | 'not_despia' | 'restore_error'
> {
  if (!isDespiaRuntime()) return 'not_despia';

  try {
    await despia('getpurchasehistory://', ['restoredData']);
  } catch {
    return 'restore_error';
  }

  const synced = await syncEntitlementFromServer();
  if (synced === 'error') return 'restore_error';
  return synced;
}

export function usePremium(
  _athleteId: string | undefined,
  userId: string | undefined,
  options?: { sessionReady?: boolean },
): {
  isPremium: boolean;
  loading: boolean;
  launchNativePaywall: () => void;
} {
  const sessionReady = options?.sessionReady ?? true;

  const resolveStatus = (uid: string | undefined): boolean | null => {
    if (!uid) return null;
    return getCachedPremium(uid);
  };

  const [premiumStatus, setPremiumStatus] = useState<boolean | null>(() => resolveStatus(userId));

  useEffect(() => {
    setPremiumStatus(resolveStatus(userId));
  }, [userId]);

  useEffect(() => {
    return subscribePremiumCache(() => {
      setPremiumStatus(resolveStatus(userId));
    });
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    if (!sessionReady || !userId) {
      return () => {
        cancelled = true;
      };
    }

    const cached = getCachedPremium(userId);
    if (cached !== null) {
      setPremiumStatus(cached);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const ok = await fetchPremiumStatus(userId);
      if (cancelled) return;
      setPremiumStatus(ok);
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionReady, userId]);

  const loading = !sessionReady || !userId || premiumStatus === null;
  const isPremium = premiumStatus === true;

  const onLaunchNativePaywall = useCallback(() => {
    if (userId) {
      launchNativePaywall(userId);
    } else {
      window.location.href = '/premium';
    }
  }, [userId]);

  return { isPremium, loading, launchNativePaywall: onLaunchNativePaywall };
}
