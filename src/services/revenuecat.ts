import { useCallback, useEffect, useState } from 'react';
import despia from 'despia-native';
import { supabase } from '@/services/supabase';

export async function checkPremium(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return false;
  }

  const athleteResult = await supabase
    .from('athletes')
    .select('is_premium')
    .eq('user_id', user.id)
    .single();

  const premium = athleteResult.data?.is_premium === true;
  return premium;
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from('athletes').update({ is_premium: true }).eq('user_id', user.id);
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
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setIsPremium(false);
        setLoading(false);
        return;
      }

      const ok = await checkPremium();
      if (cancelled) return;
      setIsPremium(ok);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const onPresentPaywall = useCallback(() => {
    if (userId) {
      presentPaywall(userId);
    } else {
      window.location.href = '/premium';
    }
  }, [userId]);

  return { isPremium, loading, presentPaywall: onPresentPaywall };
}
