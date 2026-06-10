import { engineLeagueSessionScore } from '@/lib/engineLeaguePpm';
import { runLeagueSessionScore } from '@/lib/runLeaguePpm';

/** Mirrors server scoring for display-only totals (workouts + Terra activities). */
export function activitySessionScore(
  leagueType: string,
  durationMinutes: number,
  avgHrPercent: number | null,
  avgPaceSeconds: number | null,
): number {
  if (leagueType === 'engine') {
    return engineLeagueSessionScore(avgHrPercent, durationMinutes);
  }

  if (leagueType === 'run') {
    return runLeagueSessionScore(avgPaceSeconds, durationMinutes);
  }

  return 0;
}
