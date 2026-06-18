import { useCallback, useEffect, useState } from 'react';
import despia from 'despia-native';
import { getAuthUserId } from '@/lib/authSession';
import {
  fetchPremiumStatus,
  getCachedPremium,
  setCachedPremium,
} from '@/lib/premiumCache';
import { supabase } from '@/services/supabase';

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
    return active.some((p) => p.entitlementId === 'premium');
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

export function presentPaywall(userId: string): void {
  const isDespiaApp = navigator.userAgent.toLowerCase().includes('despia');
  if (isDespiaApp) {
    void despia(`revenuecat://launchPaywall?external_id=${userId}&offering=RNKXPremium`);
  } else {
    window.location.href = `/premium`;
  }
}

export async function restoreInAppPurchasesAndApplyPremium(): Promise<'premium' | 'none' | 'not_despia' | 'restore_error'> {
  const isDespiaApp = navigator.userAgent.toLowerCase().includes('despia');
  if (!isDespiaApp) return 'not_despia';
  try {
    await despia('restoreinapppurchases://', ['restoredData']);
  } catch {
    return 'restore_error';
  }
  const ok = await applyPremiumIfStoreHasEntitlement();
  return ok ? 'premium' : 'none';
}

export function usePremium(
  athleteId: string | undefined,
  userId: string | undefined,
): {
  isPremium: boolean;
  loading: boolean;
  presentPaywall: () => void;
} {
  const initialPremium = userId ? getCachedPremium(userId) : null;
  const [isPremium, setIsPremium] = useState(initialPremium ?? false);
  const [loading, setLoading] = useState(initialPremium === null);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setIsPremium(false);
      setLoading(false);
      return;
    }

    const cached = getCachedPremium(userId);
    if (cached !== null) {
      setIsPremium(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    void (async () => {
      const ok = await fetchPremiumStatus(userId);
      if (cancelled) return;
      setIsPremium(ok);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [athleteId, userId]);

  const onPresentPaywall = useCallback(() => {
    if (userId) {
      presentPaywall(userId);
    } else {
      window.location.href = '/premium';
    }
  }, [userId]);

  return { isPremium, loading, presentPaywall: onPresentPaywall };
}
