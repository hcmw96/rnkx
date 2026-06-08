import { divisionForRank, type Division } from '@/lib/division';

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

/** Tick positions for relegation (left) and promotion (right) zone boundaries on the track. */
export function momentumBoundaryTicks(
  placesToPromotion: number | null | undefined,
  placesToRelegation: number | null | undefined,
): { relegationPct: number; promotionPct: number } {
  const promotion = placesToPromotion ?? 0;
  const relegation = placesToRelegation ?? 0;
  const span = promotion + relegation;

  if (span > 0 && placesToPromotion != null && placesToRelegation != null) {
    // Boundaries sit near the outer edges; only nudge inward when one zone is very tight.
    const relegationPct = Math.max(8, Math.min(18, 8 + (relegation / span) * 10));
    const promotionPct = Math.min(92, Math.max(82, 92 - (promotion / span) * 10));
    return { relegationPct, promotionPct };
  }

  return { relegationPct: 10, promotionPct: 90 };
}
