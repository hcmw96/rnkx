import type { ProcessActivityRpcResult } from '@/types/shareCards';

import { invokePushNotify } from './pushNotify';

function positiveScore(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Client-side push after scoring — workout-scored + friend rank flips (never from DB transaction). */
export function notifyWorkoutScoredPushes(athleteId: string, results: ProcessActivityRpcResult[]): void {
  const leaguesScored = new Set<'engine' | 'run'>();

  for (const r of results) {
    if (r.status !== 'scored') continue;

    const engineScore = positiveScore(r.engine_score);
    if (engineScore !== null) {
      leaguesScored.add('engine');
      invokePushNotify('notify-workout-scored', {
        athlete_id: athleteId,
        score: Math.round(engineScore * 10) / 10,
        league_type: 'engine',
      });
    }

    const runScore = positiveScore(r.run_score);
    if (runScore !== null) {
      leaguesScored.add('run');
      invokePushNotify('notify-workout-scored', {
        athlete_id: athleteId,
        score: Math.round(runScore * 10) / 10,
        league_type: 'run',
      });
    }
  }

  for (const leagueType of leaguesScored) {
    invokePushNotify('notify-rank-change', {
      athlete_id: athleteId,
      league_type: leagueType,
    });
  }
}
