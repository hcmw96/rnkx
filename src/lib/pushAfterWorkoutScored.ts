import type { ProcessActivityRpcResult } from '@/types/shareCards';

import { invokePushNotify } from './pushNotify';

/** Client-side push after scoring — workout-scored + friend rank flips (never from DB transaction). */
export function notifyWorkoutScoredPushes(athleteId: string, results: ProcessActivityRpcResult[]): void {
  const leaguesScored = new Set<'engine' | 'run'>();

  for (const r of results) {
    if (r.status !== 'scored') continue;

    if (typeof r.engine_score === 'number' && r.engine_score > 0) {
      leaguesScored.add('engine');
      invokePushNotify('notify-workout-scored', {
        athlete_id: athleteId,
        score: Math.round(r.engine_score * 10) / 10,
        league_type: 'engine',
      });
    }

    if (typeof r.run_score === 'number' && r.run_score > 0) {
      leaguesScored.add('run');
      invokePushNotify('notify-workout-scored', {
        athlete_id: athleteId,
        score: Math.round(r.run_score * 10) / 10,
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
