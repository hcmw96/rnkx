import { isDivision, type Division } from '@/lib/division';
import { supabase } from '@/services/supabase';

export type League = 'engine' | 'run';

/** Membership for one league in a season — source of truth: athlete_divisions. */
export async function fetchMyDivision(
  athleteId: string,
  seasonId: string,
  league: League,
): Promise<Division> {
  const { data } = await supabase
    .from('athlete_divisions')
    .select('division')
    .eq('athlete_id', athleteId)
    .eq('season_id', seasonId)
    .eq('league', league)
    .maybeSingle();

  const d = (data as { division?: string } | null)?.division;
  return isDivision(d) ? d : 'Open';
}

/** Both leagues for a season (one query). Missing rows fall back to Open. */
export async function fetchMyDivisions(
  athleteId: string,
  seasonId: string,
): Promise<{ engine: Division; run: Division }> {
  const { data } = await supabase
    .from('athlete_divisions')
    .select('league, division')
    .eq('athlete_id', athleteId)
    .eq('season_id', seasonId)
    .in('league', ['engine', 'run']);

  let engine: Division = 'Open';
  let run: Division = 'Open';
  for (const row of (data as { league?: string; division?: string }[] | null) ?? []) {
    if (row.league === 'engine' && isDivision(row.division)) engine = row.division;
    if (row.league === 'run' && isDivision(row.division)) run = row.division;
  }
  return { engine, run };
}
