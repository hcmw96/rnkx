import {
  cappedScoringDurationMinutes,
} from '@/lib/scoringSessionRules';

/** Engine League PPM cap (% max HR at or above which PPM is flat). */
export const ENGINE_PPM_MAX_HR_PERCENT = 90;

/** Flat PPM at and above {@link ENGINE_PPM_MAX_HR_PERCENT}. */
export const ENGINE_PPM_CAP = 5.2;

/** Scoring starts at this % max HR (exclusive below). */
export const ENGINE_PPM_MIN_HR_PERCENT = 58;

/** Integer % max HR → points per minute (piecewise-linear knots). */
const ENGINE_PPM_KNOTS: readonly [number, number][] = [
  [58, 0.5],
  [59, 0.5],
  [60, 0.5],
  [61, 0.61],
  [62, 0.72],
  [63, 0.83],
  [64, 0.94],
  [65, 1.05],
  [66, 1.21],
  [67, 1.37],
  [68, 1.53],
  [69, 1.69],
  [70, 1.85],
  [71, 2.05],
  [72, 2.25],
  [73, 2.43],
  [74, 2.62],
  [75, 2.8],
  [76, 2.98],
  [77, 3.16],
  [78, 3.34],
  [79, 3.52],
  [80, 3.7],
  [81, 3.8],
  [82, 3.9],
  [83, 4.0],
  [84, 4.1],
  [85, 4.2],
  [86, 4.4],
  [87, 4.6],
  [88, 4.8],
  [89, 5.0],
  [90, 5.2],
];

/** Points per minute from average HR as % of max HR (mirrors server piecewise curve). */
export function enginePointsPerMinute(hrPct: number): number {
  if (!Number.isFinite(hrPct) || hrPct < ENGINE_PPM_MIN_HR_PERCENT) return 0;
  if (hrPct >= ENGINE_PPM_MAX_HR_PERCENT) return ENGINE_PPM_CAP;

  for (let i = 0; i < ENGINE_PPM_KNOTS.length - 1; i++) {
    const [x0, y0] = ENGINE_PPM_KNOTS[i];
    const [x1, y1] = ENGINE_PPM_KNOTS[i + 1];
    if (hrPct < x0) continue;
    if (hrPct <= x1) {
      if (x1 === x0) return y0;
      const t = (hrPct - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }

  return ENGINE_PPM_CAP;
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
