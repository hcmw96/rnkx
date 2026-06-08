import { supabase } from '@/services/supabase';

/** Leaderboard rank from season scores when athlete_stats.rank is unset. */
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
