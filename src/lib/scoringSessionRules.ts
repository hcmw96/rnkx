/** Minimum duration (minutes) — sessions must be strictly longer than this to score. */
export const MIN_SCORING_DURATION_MINUTES = 15;

/** Sessions of exactly 15 minutes do not qualify. */
export function sessionDurationQualifiesForScoring(durationMinutes: number): boolean {
  return Number.isFinite(durationMinutes) && durationMinutes > MIN_SCORING_DURATION_MINUTES;
}

/**
 * Zero-point sessions must not count toward consistency-style bonuses.
 * @deprecated Use `sessionIsQualifyingForConsistencyBonus` from `@/lib/consistencyBonus`.
 */
export { sessionIsQualifyingForConsistencyBonus as sessionCountsForConsistencyBonus } from '@/lib/consistencyBonus';

export const MAX_SCORING_DURATION_MINUTES = 120;

export function cappedScoringDurationMinutes(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
  return Math.min(durationMinutes, MAX_SCORING_DURATION_MINUTES);
}
