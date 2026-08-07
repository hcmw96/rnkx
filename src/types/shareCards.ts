import type { Division } from '@/lib/division';

/** V1 workout social card — only these fields are rendered. */
export type WorkoutSharePayload = {
  leagueType: 'engine' | 'run';
  pointsScored: number;
  /** Current season standing for this league (not historical). */
  seasonRank: number | null;
  /** From athlete_divisions; Open when no membership row. */
  division: Division;
};

export type ProcessActivityRpcResult = {
  status: string;
  engine_score?: number;
  run_score?: number;
  reject_reason?: string | null;
};
