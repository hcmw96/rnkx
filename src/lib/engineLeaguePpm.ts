import { ENGINE_PPM_BY_HR_TENTHS } from '@/lib/engineLeaguePpm.generated';
import {
  cappedScoringDurationMinutes,
  sessionDurationQualifiesForScoring,
} from '@/lib/scoringSessionRules';

export const ENGINE_PPM_CAP = 4.9;
export const ENGINE_PPM_LOOKUP_MIN_TENTHS = 500;
export const ENGINE_PPM_LOOKUP_MAX_TENTHS = 1000;
export const ENGINE_PPM_MIN_HR_PERCENT = 65;

/** Points per minute from average HR as % of max HR. */
export function enginePpmFromHrPercent(hrPercent: number): number {
  if (!Number.isFinite(hrPercent) || hrPercent < ENGINE_PPM_MIN_HR_PERCENT) return 0;
  if (hrPercent > 100) return ENGINE_PPM_CAP;

  const tenths = Math.round(hrPercent * 10);
  if (tenths < ENGINE_PPM_LOOKUP_MIN_TENTHS || tenths > ENGINE_PPM_LOOKUP_MAX_TENTHS) return 0;

  const ppm = ENGINE_PPM_BY_HR_TENTHS[tenths - ENGINE_PPM_LOOKUP_MIN_TENTHS];
  return ppm != null && Number.isFinite(ppm) ? ppm : 0;
}

/** Engine League session score (1 decimal place, mirrors server). */
export function engineLeagueSessionScore(
  hrPercent: number | null,
  durationMinutes: number,
): number {
  if (!sessionDurationQualifiesForScoring(durationMinutes)) return 0;
  if (hrPercent == null || !Number.isFinite(hrPercent)) return 0;

  const ppm = enginePpmFromHrPercent(hrPercent);
  if (ppm <= 0) return 0;

  const duration = cappedScoringDurationMinutes(durationMinutes);
  const rawScore = ppm * duration;
  return Math.round(rawScore * 10) / 10;
}
