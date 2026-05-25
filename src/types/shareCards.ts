export type WorkoutSharePayload = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  activityLabel: string;
  leagueType: 'engine' | 'run';
  pointsScored: number;
  durationMin: number;
  avgHrPercent: number | null;
  avgPaceDisplay: string | null;
  seasonRank: number | null;
  leagueLabel: string;
};

export type ProcessActivityRpcResult = {
  status: string;
  engine_score?: number;
  run_score?: number;
  reject_reason?: string | null;
};
