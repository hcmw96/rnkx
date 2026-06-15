import type { ProcessActivityRpcResult } from '@/types/shareCards';

import { invokePushNotify } from './pushNotify';

/** Client-side backup when pg_net cannot reach notify-workout-scored (e.g. missing vault secret). */
export function notifyWorkoutScoredPushes(athleteId: string, results: ProcessActivityRpcResult[]): void {
  for (const r of results) {
    if (r.status !== 'scored') continue;

    if (typeof r.engine_score === 'number' && r.engine_score > 0) {
      invokePushNotify('notify-workout-scored', {
        athlete_id: athleteId,
        score: Math.round(r.engine_score * 10) / 10,
        league_type: 'engine',
      });
    }

    if (typeof r.run_score === 'number' && r.run_score > 0) {
      invokePushNotify('notify-workout-scored', {
        athlete_id: athleteId,
        score: Math.round(r.run_score * 10) / 10,
        league_type: 'run',
      });
    }
  }
}
