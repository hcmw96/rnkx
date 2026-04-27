import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';

const PREMIUM_URL = 'https://rnkx.netlify.app/premium';

export async function checkPremium(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: athlete } = await supabase
    .from('athletes')
    .select('is_premium')
    .eq('user_id', user.id)
    .single();

  return athlete?.is_premium === true;
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
    presentPaywall();
  }, []);

  return { isPremium, loading, presentPaywall: onPresentPaywall };
}
