import {
  cappedScoringDurationMinutes,
} from '@/lib/scoringSessionRules';
import {
  ENGINE_PPM_BY_HR_TENTHS,
  ENGINE_PPM_LOOKUP_BASE_TENTHS,
} from '@/lib/engineLeaguePpm.generated';

/** Engine League PPM cap (% max HR at or above which PPM is flat). */
export const ENGINE_PPM_MAX_HR_PERCENT = 90;

/** Flat PPM at and above {@link ENGINE_PPM_MAX_HR_PERCENT}. */
export const ENGINE_PPM_CAP = 5.2;

/** Scoring starts at this % max HR (exclusive below). */
export const ENGINE_PPM_MIN_HR_PERCENT = 58;

/** Points per minute from average HR as % of max HR (lookup table; mirrors server). */
export function enginePointsPerMinute(hrPct: number): number {
  if (!Number.isFinite(hrPct) || hrPct < ENGINE_PPM_MIN_HR_PERCENT) return 0;
  if (hrPct > 100) return ENGINE_PPM_CAP;

  const tenths = Math.round(hrPct * 10);
  const idx = tenths - ENGINE_PPM_LOOKUP_BASE_TENTHS;
  if (idx < 0 || idx >= ENGINE_PPM_BY_HR_TENTHS.length) return 0;
  return ENGINE_PPM_BY_HR_TENTHS[idx];
}

/** @deprecated Use {@link enginePointsPerMinute}. */
export const enginePpmFromHrPercent = enginePointsPerMinute;

/** Engine League session score (1 decimal place, mirrors server). */
export function engineLeagueSessionScore(
  hrPercent: number | null,
  durationMinutes: number,
): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 15) return 0;
  if (hrPercent == null || !Number.isFinite(hrPercent)) return 0;

  const ppm = enginePointsPerMinute(hrPercent);
  if (ppm <= 0) return 0;

  const duration = cappedScoringDurationMinutes(durationMinutes);
  const rawScore = ppm * duration;
  return Math.round(rawScore * 10) / 10;
}
