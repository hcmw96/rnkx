import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';

const PREMIUM_URL = 'https://rnkx.netlify.app/premium';

export async function checkPremium(_athleteId: string): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return false;

  const { data, error } = await supabase.functions.invoke('check-entitlement', {
    body: {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error) return false;
  return Boolean((data as { isPremium?: boolean } | null)?.isPremium);
}

export function presentPaywall(): void {
  window.location.href = PREMIUM_URL;
}

export function usePremium(athleteId: string | undefined): {
  isPremium: boolean;
  loading: boolean;
  presentPaywall: () => void;
} {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(Boolean(athleteId));

  useEffect(() => {
    if (!athleteId) {
      setIsPremium(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      const ok = await checkPremium(athleteId);
      if (!cancelled) {
        setIsPremium(ok);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const onPresentPaywall = useCallback(() => {
    presentPaywall();
  }, []);

  return { isPremium, loading, presentPaywall: onPresentPaywall };
}
