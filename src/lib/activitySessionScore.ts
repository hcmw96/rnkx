import { runLeagueSessionScore } from '@/lib/runLeaguePpm';
import {
  cappedScoringDurationMinutes,
  sessionDurationQualifiesForScoring,
} from '@/lib/scoringSessionRules';

/** Mirrors server scoring for display-only totals (workouts + Terra activities). */
export function activitySessionScore(
  leagueType: string,
  durationMinutes: number,
  avgHrPercent: number | null,
  avgPaceSeconds: number | null,
): number {
  if (!sessionDurationQualifiesForScoring(durationMinutes)) return 0;

  const duration = cappedScoringDurationMinutes(durationMinutes);

  if (leagueType === 'engine' && avgHrPercent != null) {
    const v =
      avgHrPercent >= 90
        ? duration * 4.8
        : avgHrPercent >= 85
          ? duration * 4.2
          : avgHrPercent >= 80
            ? duration * 3.7
            : avgHrPercent >= 75
              ? duration * 2.8
              : avgHrPercent >= 70
                ? duration * 2.0
                : avgHrPercent >= 60
                  ? duration * 1.4
                  : avgHrPercent >= 45
                    ? duration * 0.8
                    : 0;
    return Math.round(v * 10) / 10;
  }

  if (leagueType === 'run') {
    return runLeagueSessionScore(avgPaceSeconds, durationMinutes);
  }

  return 0;
}
