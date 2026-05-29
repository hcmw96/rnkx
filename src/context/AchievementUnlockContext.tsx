import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AchievementUnlockModal } from '@/components/profile/AchievementUnlockModal';
import {
  markAchievementsCelebrated,
  syncAthleteAchievements,
  type AchievementState,
} from '@/lib/achievements';
import { invokePushNotify } from '@/lib/pushNotify';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { supabase } from '@/services/supabase';

const SCORE_DEBOUNCE_MS = 1200;

type AchievementUnlockContextValue = {
  /** Run after manual sync or other flows that may unlock badges without realtime. */
  refreshAchievements: () => Promise<void>;
};

const AchievementUnlockContext = createContext<AchievementUnlockContextValue | null>(null);

export function useAchievementUnlock(): AchievementUnlockContextValue {
  const ctx = useContext(AchievementUnlockContext);
  if (!ctx) {
    throw new Error('useAchievementUnlock must be used within AchievementUnlockProvider');
  }
  return ctx;
}

type AchievementUnlockProviderProps = {
  children: ReactNode;
  authUserId: string | undefined;
  enabled: boolean;
};

function mergeQueue(existing: AchievementState[], incoming: AchievementState[]): AchievementState[] {
  const seen = new Set(existing.map((a) => a.id));
  const next = [...existing];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  return next;
}

export function AchievementUnlockProvider({ children, authUserId, enabled }: AchievementUnlockProviderProps) {
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [current, setCurrent] = useState<AchievementState | null>(null);
  const queueRef = useRef<AchievementState[]>([]);
  const syncingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedAtRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled || !authUserId) {
      setAthleteId(undefined);
      return;
    }
    void resolveAthleteId(authUserId).then(setAthleteId);
  }, [enabled, authUserId]);

  const presentNext = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    setCurrent(next);
  }, []);

  const enqueueCelebrations = useCallback(
    (items: AchievementState[], aid: string) => {
      if (!items.length) return;

      const hadQueue = queueRef.current.length > 0;
      queueRef.current = mergeQueue(queueRef.current, items);

      setCurrent((showing) => {
        if (showing) return showing;
        return queueRef.current.shift() ?? null;
      });

      if (document.visibilityState === 'hidden' && items[0] && !hadQueue) {
        const badge = items[0];
        invokePushNotify('send-notification', {
          athlete_id: aid,
          title: 'Achievement unlocked!',
          message: `${badge.name} — ${badge.criteria}`,
          path: '/app/profile',
        });
      }
    },
    [],
  );

  const runSync = useCallback(
    async (aid: string) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        const { newlyUnlocked, pendingCelebration } = await syncAthleteAchievements(aid);
        enqueueCelebrations([...pendingCelebration, ...newlyUnlocked], aid);
      } finally {
        syncingRef.current = false;
      }
    },
    [enqueueCelebrations],
  );

  const refreshAchievements = useCallback(async () => {
    if (!athleteId) return;
    await runSync(athleteId);
  }, [athleteId, runSync]);

  const scheduleSync = useCallback(
    (aid: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void runSync(aid);
      }, SCORE_DEBOUNCE_MS);
    },
    [runSync],
  );

  const handleDismiss = useCallback(async () => {
    if (current && athleteId) {
      await markAchievementsCelebrated(athleteId, [current.id]);
    }
    presentNext();
  }, [athleteId, current, presentNext]);

  useEffect(() => {
    if (!enabled || !athleteId) return;

    subscribedAtRef.current = Date.now();
    void runSync(athleteId);

    const onScoredWorkout = () => scheduleSync(athleteId);
    const channel = supabase
      .channel(`achievement-unlock-${athleteId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'workouts',
          filter: `athlete_id=eq.${athleteId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.status !== 'scored') return;
          const created = row.created_at ? new Date(String(row.created_at)).getTime() : Date.now();
          if (created < subscribedAtRef.current - 5000) return;
          onScoredWorkout();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workouts',
          filter: `athlete_id=eq.${athleteId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.status !== 'scored') return;
          onScoredWorkout();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activities',
          filter: `athlete_id=eq.${athleteId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.status != null && row.status !== 'scored') return;
          const created = row.created_at ? new Date(String(row.created_at)).getTime() : Date.now();
          if (created < subscribedAtRef.current - 5000) return;
          onScoredWorkout();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'athlete_stats',
          filter: `athlete_id=eq.${athleteId}`,
        },
        () => {
          scheduleSync(athleteId);
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void runSync(athleteId);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [athleteId, enabled, runSync, scheduleSync]);

  const queueLength = current ? queueRef.current.length + 1 : 0;

  return (
    <AchievementUnlockContext.Provider value={{ refreshAchievements }}>
      {children}
      {current ? (
        <AchievementUnlockModal
          achievement={current}
          queueLength={queueLength}
          onDismiss={() => void handleDismiss()}
        />
      ) : null}
    </AchievementUnlockContext.Provider>
  );
}
