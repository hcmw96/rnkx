import { supabase } from '@/services/supabase';

export type LiveCategoryRanks = {
  engine: number | null;
  run: number | null;
};

function parsePositiveRank(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Live engine/run ranks from season_division_leaderboard (window function).
 * The athlete column on this view is `id`, not athlete_id. Rank columns on
 * athlete_stats are not maintained and must not be used as the primary source.
 */
export async function fetchLiveCategoryRanks(
  athleteId: string,
  seasonId: string,
): Promise<LiveCategoryRanks> {
  const empty: LiveCategoryRanks = { engine: null, run: null };
  if (!athleteId || !seasonId) return empty;

  const { data, error } = await supabase
    .from('season_division_leaderboard')
    .select('league, rank')
    .eq('season_id', seasonId)
    .eq('id', athleteId)
    .in('league', ['engine', 'run']);

  if (error) {
    console.warn('fetchLiveCategoryRanks failed', error.message);
    return empty;
  }

  const ranks: LiveCategoryRanks = { engine: null, run: null };
  for (const row of data ?? []) {
    const league = (row as { league?: string }).league;
    const rank = parsePositiveRank((row as { rank?: unknown }).rank);
    if (rank == null) continue;
    if (league === 'engine' && ranks.engine == null) ranks.engine = rank;
    if (league === 'run' && ranks.run == null) ranks.run = rank;
  }
  return ranks;
}

/** Live rank from the season/division board for one league. */
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
    .limit(1);

  if (error) {
    console.warn('fetchLiveCategoryRank failed', error.message);
    return null;
  }

  const row = (data ?? [])[0] as { rank?: unknown } | undefined;
  return parsePositiveRank(row?.rank);
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
