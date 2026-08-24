import { supabase } from '@/services/supabase';

function parsePositiveRank(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Live rank from the season/division board (window function), not athlete_stats.rank. */
export async function fetchLiveCategoryRank(
  athleteId: string,
  seasonId: string,
  category: 'engine' | 'run',
): Promise<number | null> {
  if (!athleteId || !seasonId) return null;

  const { data, error } = await supabase
    .from('season_division_leaderboard')
    .select('rank')
    .eq('season_id', seasonId)
    .eq('id', athleteId)
    .eq('league', category)
    .maybeSingle();

  if (error) {
    console.warn('fetchLiveCategoryRank failed', error.message);
    return null;
  }

  return parsePositiveRank((data as { rank?: unknown } | null)?.rank);
}

/** Count-based rank from season scores when the live board has no row. */
export async function computeCategoryRank(
  seasonId: string,
  category: 'engine' | 'run',
  score: number,
): Promise<number | null> {
  if (!seasonId || !Number.isFinite(score) || score <= 0) return null;

  const { count, error } = await supabase
    .from('athlete_stats')
    .select('athlete_id', { count: 'exact', head: true })
    .eq('season_id', seasonId)
    .eq('category', category)
    .gt('score', score);

  if (error) {
    console.warn('computeCategoryRank failed', error.message);
    return null;
  }

  return (count ?? 0) + 1;
}
