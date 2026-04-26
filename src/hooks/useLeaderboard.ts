import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import type { LeagueFilter } from '../lib/scoring';

export interface LeaderboardEntry {
  id: string;
  display_name: string;
  total_score: number;
  rank: number;
}

export function useLeaderboard(filter: LeagueFilter) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('leaderboard')
        .select('id,display_name,total_score,rank')
        .order('rank', { ascending: true });

      if (queryError) {
        setError(queryError.message);
        setEntries([]);
      } else {
        setEntries((data ?? []) as LeaderboardEntry[]);
      }
      setLoading(false);
    };

    void load();
  }, [filter]);

  const scopedEntries = useMemo(() => entries, [entries]);

  return { entries: scopedEntries, loading, error };
}
