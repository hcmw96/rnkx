import { divisionForRank, type Division } from '@/lib/division';

/** Top fraction of a division treated as the promotion zone on the momentum bar. */
export const PROMOTION_ZONE_PERCENT = 0.1;

const DIVISION_MIN: Record<Division, number> = {
  Open: 1,
  Challenger: 251,
  Pro: 501,
  Elite: 1001,
};

const DIVISION_MAX: Record<Division, number> = {
  Open: 250,
  Challenger: 500,
  Pro: 1000,
  Elite: Number.POSITIVE_INFINITY,
};

export type MomentumPlaces = {
  division: Division;
  placesToPromotion: number | null;
  placesToRelegation: number | null;
};

function divisionSpan(division: Division): number | null {
  const max = DIVISION_MAX[division];
  if (!Number.isFinite(max)) return null;
  return max - DIVISION_MIN[division];
}

/** Places and division derived from global rank bands (leaderboard position). */
export function momentumPlacesFromRank(rank: number | null | undefined): MomentumPlaces {
  if (rank == null || !Number.isFinite(rank) || rank <= 0) {
    return { division: 'Open', placesToPromotion: null, placesToRelegation: null };
  }

  const r = Math.round(rank);
  const division = divisionForRank(r);
  const min = DIVISION_MIN[division];
  const max = DIVISION_MAX[division];

  const placesToPromotion = Math.max(0, r - min);
  const placesToRelegation = Number.isFinite(max) ? Math.max(0, max - r) : null;

  return { division, placesToPromotion, placesToRelegation };
}

/** Whether the athlete sits in the top PROMOTION_ZONE_PERCENT of their division. */
export function isInPromotionZone(
  division: Division,
  placesToPromotion: number | null | undefined,
): boolean {
  if (placesToPromotion == null) return false;
  const span = divisionSpan(division);
  if (span == null || span <= 0) return placesToPromotion === 0;
  return placesToPromotion / span <= PROMOTION_ZONE_PERCENT;
}

/** Promotion boundary tick on the right edge of the momentum track. */
export function momentumPromotionTickPct(): number {
  return 92;
}

/** Marker position along a left→right progress-to-promotion strip. */
export function momentumThumbPosition(
  division: Division,
  placesToPromotion: number | null | undefined,
): number {
  const promotionPct = momentumPromotionTickPct();
  const trackStart = 4;

  if (placesToPromotion == null) return (trackStart + promotionPct) / 2;

  const span = divisionSpan(division);
  if (span == null || span <= 0) {
    return placesToPromotion === 0 ? promotionPct : trackStart;
  }

  const progress = 1 - Math.min(placesToPromotion, span) / span;
  return trackStart + progress * (promotionPct - trackStart);
}
