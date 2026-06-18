import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { warmPremiumCache } from '@/lib/premiumCache';
import { resolveAthleteId } from '@/lib/resolveAthleteId';

type AthleteSessionValue = {
  authUserId: string | undefined;
  athleteId: string | undefined;
  ready: boolean;
};

const AthleteSessionContext = createContext<AthleteSessionValue>({
  authUserId: undefined,
  athleteId: undefined,
  ready: false,
});

export function AthleteSessionProvider({
  authUserId,
  children,
}: {
  authUserId: string | undefined;
  children: ReactNode;
}) {
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [ready, setReady] = useState(!authUserId);

  useEffect(() => {
    if (!authUserId) {
      setAthleteId(undefined);
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);

    void (async () => {
      const [aid] = await Promise.all([
        resolveAthleteId(authUserId),
        warmPremiumCache(authUserId),
      ]);
      if (cancelled) return;
      setAthleteId(aid);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  return (
    <AthleteSessionContext.Provider value={{ authUserId, athleteId, ready }}>
      {children}
    </AthleteSessionContext.Provider>
  );
}

export function useAthleteSession(): AthleteSessionValue {
  return useContext(AthleteSessionContext);
}
