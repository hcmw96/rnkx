/**
 * Weekly consistency bonus tiers.
 *
 * Thresholds apply to the number of **qualifying workouts** in a Mon–Sun week.
 * A qualifying workout is any session that scored > 0 points.
 */

export type ConsistencyTier = {
  /** Minimum qualifying workouts required to reach this tier. */
  minWorkouts: number;
  /** Maximum qualifying workouts that stay in this tier (inclusive). */
  maxWorkouts: number;
  /** Bonus points awarded. */
  bonusPoints: number;
  /** Display label. */
  label: string;
};

export const CONSISTENCY_TIERS: readonly ConsistencyTier[] = [
  { minWorkouts: 3, maxWorkouts: 4, bonusPoints: 10, label: '3–4 workouts' },
  { minWorkouts: 5, maxWorkouts: 6, bonusPoints: 25, label: '5–6 workouts' },
  { minWorkouts: 7, maxWorkouts: Infinity, bonusPoints: 50, label: '7+ workouts' },
] as const;

/**
 * Returns the bonus points for a given count of qualifying workouts this week.
 * Only the single highest tier is awarded.
 */
export function consistencyBonusPoints(qualifyingWorkouts: number): number {
  for (let i = CONSISTENCY_TIERS.length - 1; i >= 0; i--) {
    const tier = CONSISTENCY_TIERS[i];
    if (qualifyingWorkouts >= tier.minWorkouts) {
      return tier.bonusPoints;
    }
  }
  return 0;
}

/**
 * Returns the tier object for a given qualifying workout count, or null if
 * none is reached.
 */
export function consistencyTierForCount(
  qualifyingWorkouts: number,
): ConsistencyTier | null {
  for (let i = CONSISTENCY_TIERS.length - 1; i >= 0; i--) {
    const tier = CONSISTENCY_TIERS[i];
    if (qualifyingWorkouts >= tier.minWorkouts) {
      return tier;
    }
  }
  return null;
}

/**
 * Returns the next tier above the current qualifying count, or null if already
 * at the highest tier.
 */
export function nextConsistencyTier(
  qualifyingWorkouts: number,
): ConsistencyTier | null {
  for (const tier of CONSISTENCY_TIERS) {
    if (qualifyingWorkouts < tier.minWorkouts) return tier;
  }
  return null;
}

/**
 * Whether a session with the given score counts toward the weekly consistency
 * bonus. Sessions scoring exactly 0 do not count.
 */
export function sessionIsQualifyingForConsistencyBonus(sessionScore: number): boolean {
  return Number.isFinite(sessionScore) && sessionScore > 0;
}
