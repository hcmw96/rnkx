import { RUN_PPM_BY_PACE_SECONDS } from '@/lib/runLeaguePpm.generated';
import {
  cappedScoringDurationMinutes,
  sessionDurationQualifiesForScoring,
} from '@/lib/scoringSessionRules';

export const RUN_PPM_FAST_CAP = 5.6;
export const RUN_PPM_LOOKUP_MIN_PACE = 181;
export const RUN_PPM_LOOKUP_MAX_PACE = 450;

/** Points per minute from average pace (seconds per km). */
export function runPpmFromPace(paceSecondsPerKm: number): number {
  if (!Number.isFinite(paceSecondsPerKm) || paceSecondsPerKm <= 0) return 0;

  const pace = Math.round(paceSecondsPerKm);
  if (pace <= 180) return RUN_PPM_FAST_CAP;
  if (pace > RUN_PPM_LOOKUP_MAX_PACE) return 0;

  const index = pace - RUN_PPM_LOOKUP_MIN_PACE;
  const ppm = RUN_PPM_BY_PACE_SECONDS[index];
  return ppm != null && Number.isFinite(ppm) ? ppm : 0;
}

/** Run League session score (whole points, rounded up). */
export function runLeagueSessionScore(
  paceSecondsPerKm: number | null,
  durationMinutes: number,
): number {
  if (!sessionDurationQualifiesForScoring(durationMinutes)) return 0;
  if (paceSecondsPerKm == null || paceSecondsPerKm <= 0) return 0;

  const ppm = runPpmFromPace(paceSecondsPerKm);
  if (ppm <= 0) return 0;

  const duration = cappedScoringDurationMinutes(durationMinutes);
  const rawScore = ppm * duration;
  return Math.ceil(rawScore);
}
