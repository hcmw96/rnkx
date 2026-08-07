import type { Division } from '@/lib/division';

/** Row shape from public.division_rules (read at runtime — never hardcode %). */
export type DivisionRule = {
  division: string;
  promote_percent: number | null;
  promote_min_count: number | null;
  relegate_percent: number | null;
  promotes_to: string | null;
  relegates_to: string | null;
};

export type MomentumPlaces = {
  division: Division;
  placesToPromotion: number | null;
  placesToRelegation: number | null;
  /** Athletes in this division (for momentum bar scale). */
  divisionSize: number;
  /** Promote cutoff slots from division_rules (0 when Elite / no promo). */
  promoteSlots: number;
};

/** Same slot math as compute_season_promotions (ceil % of N, Open min-count, capped at N). */
export function promoteSlotCount(rule: DivisionRule, divisionSize: number): number {
  if (
    rule.promote_percent == null ||
    rule.promotes_to == null ||
    !Number.isFinite(divisionSize) ||
    divisionSize <= 0
  ) {
    return 0;
  }
  let slots = Math.ceil((divisionSize * Number(rule.promote_percent)) / 100);
  if (rule.promote_min_count != null) {
    slots = Math.max(slots, Math.round(Number(rule.promote_min_count)));
  }
  return Math.min(slots, divisionSize);
}

export function relegateSlotCount(rule: DivisionRule, divisionSize: number): number {
  if (
    rule.relegate_percent == null ||
    rule.relegates_to == null ||
    !Number.isFinite(divisionSize) ||
    divisionSize <= 0
  ) {
    return 0;
  }
  return Math.min(
    Math.ceil((divisionSize * Number(rule.relegate_percent)) / 100),
    divisionSize,
  );
}

/**
 * Places from promotion / relegation using in-division rank and division_rules.
 * Elite → no promotion target; Open → no relegation.
 */
export function momentumPlacesFromDivisionStanding(args: {
  division: Division;
  rank: number | null | undefined;
  divisionSize: number;
  rule: DivisionRule | null | undefined;
}): MomentumPlaces {
  const division = args.division;
  const size =
    Number.isFinite(args.divisionSize) && args.divisionSize > 0
      ? Math.round(args.divisionSize)
      : 0;
  const rule = args.rule;
  const empty: MomentumPlaces = {
    division,
    placesToPromotion: null,
    placesToRelegation: null,
    divisionSize: size,
    promoteSlots: 0,
  };

  if (rankInvalid(args.rank) || size <= 0 || !rule) return empty;

  const rank = Math.round(args.rank as number);
  const pSlots = promoteSlotCount(rule, size);
  const rSlots = relegateSlotCount(rule, size);

  const placesToPromotion =
    rule.promotes_to == null || rule.promote_percent == null
      ? null
      : Math.max(0, rank - pSlots);

  // First relegating rank is (N - relegateSlots + 1); distance down to that line.
  const placesToRelegation =
    rule.relegates_to == null || rule.relegate_percent == null
      ? null
      : Math.max(0, size - rSlots + 1 - rank);

  return {
    division,
    placesToPromotion,
    placesToRelegation,
    divisionSize: size,
    promoteSlots: pSlots,
  };
}

function rankInvalid(rank: number | null | undefined): boolean {
  return rank == null || !Number.isFinite(rank) || rank <= 0;
}

/** In the promote band when places-to-promotion is zero (and promotion exists). */
export function isInPromotionZone(placesToPromotion: number | null | undefined): boolean {
  return placesToPromotion === 0;
}

/** Promotion boundary tick on the right edge of the momentum track. */
export function momentumPromotionTickPct(): number {
  return 92;
}

/** Marker position along a left→right progress-to-promotion strip. */
export function momentumThumbPosition(
  placesToPromotion: number | null | undefined,
  divisionSize: number,
  promoteSlots: number,
): number {
  const promotionPct = momentumPromotionTickPct();
  const trackStart = 4;

  if (placesToPromotion == null) return (trackStart + promotionPct) / 2;

  const maxPlaces = Math.max(0, Math.round(divisionSize) - Math.round(promoteSlots));
  if (maxPlaces <= 0) {
    return placesToPromotion === 0 ? promotionPct : trackStart;
  }

  const progress = 1 - Math.min(placesToPromotion, maxPlaces) / maxPlaces;
  return trackStart + progress * (promotionPct - trackStart);
}
