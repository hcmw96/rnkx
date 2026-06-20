import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { invokePushEdgeFunction } from './invokePushEdgeFunction.ts';

export type LeagueType = 'engine' | 'run';

type ScoredActivity = {
  athleteId: string;
  leagueType: LeagueType;
  score: number;
};

/** Read back activity after insert trigger; score via calculate_activity_score RPC. */
async function resolveScoredActivity(
  supabase: SupabaseClient,
  activityId: string,
): Promise<ScoredActivity | null> {
  const { data, error } = await supabase
    .from('activities')
    .select('athlete_id, status, league_type, duration_minutes, avg_hr_percent, avg_pace_seconds')
    .eq('id', activityId)
    .maybeSingle();

  if (error || !data) {
    console.error('[pushAfterActivity] read activity', error);
    return null;
  }

  if ((data.status ?? 'scored').toLowerCase() !== 'scored') return null;

  const leagueType: LeagueType = data.league_type === 'run' ? 'run' : 'engine';

  const { data: scoreRaw, error: scoreErr } = await supabase.rpc('calculate_activity_score', {
    p_league_type: leagueType,
    p_duration_minutes: data.duration_minutes,
    p_avg_hr_percent: data.avg_hr_percent,
    p_avg_pace_seconds: data.avg_pace_seconds,
  });

  if (scoreErr) {
    console.error('[pushAfterActivity] calculate_activity_score', scoreErr);
    return null;
  }

  const score = Number(scoreRaw) || 0;
  if (score <= 0) return null;

  return {
    athleteId: String(data.athlete_id),
    leagueType,
    score,
  };
}

/**
 * Fire notify-workout-scored + notify-rank-change after Terra/WHOOP activity inserts.
 * Never throws — log and swallow errors.
 */
export function scheduleActivityScoringPushes(
  supabase: SupabaseClient,
  athleteId: string,
  activityIds: string[],
  logLabel: string,
): void {
  if (!activityIds.length) return;

  void (async () => {
    try {
      const leaguesScored = new Set<LeagueType>();

      for (const activityId of activityIds) {
        const scored = await resolveScoredActivity(supabase, activityId);
        if (!scored) continue;

        await invokePushEdgeFunction('notify-workout-scored', {
          athlete_id: scored.athleteId,
          score: Math.round(scored.score * 10) / 10,
          league_type: scored.leagueType,
        });
        leaguesScored.add(scored.leagueType);
      }

      for (const leagueType of leaguesScored) {
        await invokePushEdgeFunction('notify-rank-change', {
          athlete_id: athleteId,
          league_type: leagueType,
        });
      }
    } catch (e) {
      console.error(`[${logLabel}] scoring push failed`, e);
    }
  })();
}
