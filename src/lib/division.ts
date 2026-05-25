export type Division = 'Open' | 'Challenger' | 'Pro' | 'Elite';

const DIVISION_ORDER: Division[] = ['Open', 'Challenger', 'Pro', 'Elite'];

/** Rank bands for division filtering on leaderboard (until per-athlete division is in API). */
export function divisionForRank(rank: number): Division {
  if (rank <= 250) return 'Open';
  if (rank <= 500) return 'Challenger';
  if (rank <= 1000) return 'Pro';
  return 'Elite';
}

export function isDivision(value: string | null | undefined): value is Division {
  return DIVISION_ORDER.includes(value as Division);
}
