import type { WorkoutObject } from '@/services/despia';
import type { ProcessActivityRpcResult } from '@/types/shareCards';

export { buildWorkoutShareFromAppleSync as buildWorkoutSharePayload } from '@/lib/buildWorkoutSharePayload';

export function pickBestScoredWorkoutFromSync(
  workouts: WorkoutObject[],
  results: ProcessActivityRpcResult[],
): { workout: WorkoutObject; result: ProcessActivityRpcResult } | null {
  let best: { workout: WorkoutObject; result: ProcessActivityRpcResult; points: number } | null = null;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result || result.status !== 'scored') continue;
    const engine = Number(result.engine_score) || 0;
    const run = Number(result.run_score) || 0;
    const points = Math.max(engine, run);
    if (points <= 0) continue;
    const workout = workouts[i];
    if (!workout) continue;
    if (!best || points > best.points) {
      best = { workout, result, points };
    }
  }

  return best ? { workout: best.workout, result: best.result } : null;
}
