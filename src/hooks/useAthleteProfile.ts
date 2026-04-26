import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

export interface AthleteProfile {
  id: string;
  display_name: string;
  age: number;
  total_score: number;
  last_synced: string | null;
}

export interface WorkoutItem {
  id: string;
  started_at: string;
  activity_type: string | null;
  engine_score: number;
  run_score: number;
  status: 'scored' | 'rejected' | 'pending';
  reject_reason: string | null;
}

export function useAthleteProfile(userId?: string) {
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    const [{ data: athlete, error: athleteError }, { data: recent, error: workoutsError }, { data: board }] =
      await Promise.all([
        supabase.from('athletes').select('id,display_name,age,total_score,last_synced').eq('id', userId).single(),
        supabase
          .from('workouts')
          .select('id,started_at,activity_type,engine_score,run_score,status,reject_reason')
          .eq('athlete_id', userId)
          .order('started_at', { ascending: false })
          .limit(20),
        supabase.from('leaderboard').select('id,rank').eq('id', userId).maybeSingle(),
      ]);

    if (athleteError) {
      setError(athleteError.message);
    } else {
      setProfile(athlete as AthleteProfile);
      setRank((board as { id: string; rank: number } | null)?.rank ?? null);
      setWorkouts((recent ?? []) as WorkoutItem[]);
    }

    if (workoutsError) {
      setError(workoutsError.message);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { profile, rank, workouts, loading, error, refresh };
}
