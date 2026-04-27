import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';

const PREMIUM_URL = 'https://rnkx.netlify.app/premium';

export async function checkPremium(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  console.log('[checkPremium] user', user);
  if (!user) {
    console.log('[checkPremium] final return', false);
    return false;
  }

  const athleteResult = await supabase
    .from('athletes')
    .select('is_premium')
    .eq('user_id', user.id)
    .single();
  console.log('[checkPremium] athlete query result', athleteResult);

  const premium = athleteResult.data?.is_premium === true;
  console.log('[checkPremium] final return', premium);
  return premium;
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
    console.log('[usePremium] loading started');

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      console.log('[usePremium] auth resolved', { user });

      if (cancelled) return;

      if (!user) {
        console.log('[usePremium] final isPremium', false);
        setIsPremium(false);
        setLoading(false);
        return;
      }

      const ok = await checkPremium();
      if (cancelled) return;
      console.log('[usePremium] final isPremium', ok);
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
