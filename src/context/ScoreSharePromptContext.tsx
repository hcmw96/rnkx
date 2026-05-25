import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { WorkoutShareDialog } from '@/components/share/WorkoutShareDialog';
import {
  buildWorkoutShareFromActivityRow,
  buildWorkoutShareFromAppleSync,
  buildWorkoutShareFromWorkoutRow,
} from '@/lib/buildWorkoutSharePayload';
import { pickBestScoredWorkoutFromSync } from '@/lib/buildWorkoutShareFromSync';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import {
  markSharePrompted,
  sharePromptDedupeKey,
  wasSharePrompted,
} from '@/lib/workoutSharePromptStorage';
import type { WorkoutObject } from '@/services/despia';
import { supabase } from '@/services/supabase';
import type { ProcessActivityRpcResult, WorkoutSharePayload } from '@/types/shareCards';

const RECENT_MS = 15 * 60 * 1000;

type ScoreSharePromptContextValue = {
  /** Call after Apple sync when RPC returns newly scored workouts. */
  promptFromAppleSync: (
    athleteId: string,
    workouts: WorkoutObject[],
    results: ProcessActivityRpcResult[],
  ) => Promise<void>;
};

const ScoreSharePromptContext = createContext<ScoreSharePromptContextValue | null>(null);

export function useScoreSharePrompt(): ScoreSharePromptContextValue {
  const ctx = useContext(ScoreSharePromptContext);
  if (!ctx) {
    throw new Error('useScoreSharePrompt must be used within ScoreSharePromptProvider');
  }
  return ctx;
}

type ScoreSharePromptProviderProps = {
  children: ReactNode;
  authUserId: string | undefined;
  enabled: boolean;
};

export function ScoreSharePromptProvider({ children, authUserId, enabled }: ScoreSharePromptProviderProps) {
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<WorkoutSharePayload | null>(null);
  const subscribedAtRef = useRef(Date.now());
  const promptingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !authUserId) {
      setAthleteId(undefined);
      return;
    }
    void resolveAthleteId(authUserId).then(setAthleteId);
  }, [enabled, authUserId]);

  const offerShare = useCallback((next: WorkoutSharePayload, dedupeKey: string) => {
    if (wasSharePrompted(dedupeKey) || promptingRef.current) return;
    markSharePrompted(dedupeKey);
    promptingRef.current = true;
    setPayload(next);
    setOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      promptingRef.current = false;
      setPayload(null);
    }
  }, []);

  const promptFromWorkoutRow = useCallback(
    async (aid: string, row: Record<string, unknown>, dedupeKey: string) => {
      if (wasSharePrompted(dedupeKey)) return;
      const built = await buildWorkoutShareFromWorkoutRow(aid, row as Parameters<typeof buildWorkoutShareFromWorkoutRow>[1]);
      if (built) offerShare(built, dedupeKey);
    },
    [offerShare],
  );

  const promptFromActivityRow = useCallback(
    async (aid: string, row: Record<string, unknown>, dedupeKey: string) => {
      if (wasSharePrompted(dedupeKey)) return;
      const built = await buildWorkoutShareFromActivityRow(
        aid,
        row as Parameters<typeof buildWorkoutShareFromActivityRow>[1],
      );
      if (built) offerShare(built, dedupeKey);
    },
    [offerShare],
  );

  const checkRecentScores = useCallback(
    async (aid: string) => {
      const since = new Date(Date.now() - RECENT_MS).toISOString();

      const { data: workout } = await supabase
        .from('workouts')
        .select('id, engine_score, run_score, duration_min, avg_hr, avg_pace_per_km, activity_type, created_at')
        .eq('athlete_id', aid)
        .eq('status', 'scored')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (workout) {
        const engine = Number(workout.engine_score) || 0;
        const run = Number(workout.run_score) || 0;
        if (Math.max(engine, run) > 0) {
          const key = sharePromptDedupeKey('workout', workout.id);
          if (!wasSharePrompted(key)) {
            await promptFromWorkoutRow(aid, workout, key);
            return;
          }
        }
      }

      const { data: activity } = await supabase
        .from('activities')
        .select(
          'id, league_type, activity_type, duration_minutes, avg_hr_percent, avg_pace_seconds, workout_start_time, activity_date',
        )
        .eq('athlete_id', aid)
        .eq('status', 'scored')
        .order('workout_start_time', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (activity) {
        const at =
          activity.workout_start_time != null
            ? new Date(String(activity.workout_start_time)).getTime()
            : new Date(`${activity.activity_date}T12:00:00`).getTime();
        if (Number.isFinite(at) && at >= Date.now() - RECENT_MS) {
          const key = sharePromptDedupeKey('activity', activity.id);
          if (!wasSharePrompted(key)) {
            await promptFromActivityRow(aid, activity, key);
          }
        }
      }
    },
    [promptFromActivityRow, promptFromWorkoutRow],
  );

  const promptFromAppleSync = useCallback(
    async (aid: string, workouts: WorkoutObject[], results: ProcessActivityRpcResult[]) => {
      const picked = pickBestScoredWorkoutFromSync(workouts, results);
      if (!picked) return;

      const sourceKey = `apple:${picked.workout.sourceId}`;
      if (wasSharePrompted(sourceKey)) return;

      const built = await buildWorkoutShareFromAppleSync(aid, picked.workout, picked.result);
      if (!built) return;

      markSharePrompted(sourceKey);
      offerShare(built, sourceKey);

      // After insert, also mark DB id when row appears (avoid double prompt from realtime)
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data: row } = await supabase
        .from('workouts')
        .select('id')
        .eq('athlete_id', aid)
        .eq('source_id', picked.workout.sourceId)
        .gte('created_at', since)
        .maybeSingle();
      if (row?.id) markSharePrompted(sharePromptDedupeKey('workout', row.id));
    },
    [offerShare],
  );

  useEffect(() => {
    if (!enabled || !athleteId) return;

    subscribedAtRef.current = Date.now();

    const channel = supabase
      .channel(`score-share-${athleteId}`)
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
          const id = String(row.id ?? '');
          if (!id) return;
          void promptFromWorkoutRow(athleteId, row, sharePromptDedupeKey('workout', id));
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
          const id = String(row.id ?? '');
          if (!id) return;
          void promptFromWorkoutRow(athleteId, row, sharePromptDedupeKey('workout', id));
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
          const id = String(row.id ?? '');
          if (!id) return;
          void promptFromActivityRow(athleteId, row, sharePromptDedupeKey('activity', id));
        },
      )
      .subscribe();

    void checkRecentScores(athleteId);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkRecentScores(athleteId);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [
    athleteId,
    enabled,
    checkRecentScores,
    promptFromActivityRow,
    promptFromWorkoutRow,
  ]);

  const value: ScoreSharePromptContextValue = {
    promptFromAppleSync,
  };

  return (
    <ScoreSharePromptContext.Provider value={value}>
      {children}
      <WorkoutShareDialog open={open} onOpenChange={handleDialogOpenChange} payload={payload} />
    </ScoreSharePromptContext.Provider>
  );
}
