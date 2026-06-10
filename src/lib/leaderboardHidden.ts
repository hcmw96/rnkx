type LeaderboardLeague = 'engine' | 'run';

/** Athlete IDs omitted from public run leaderboard display (temporary). */
export const HIDDEN_RUN_LEADERBOARD_ATHLETE_IDS = new Set<string>([
  '21088c01-4110-4456-9010-98c7a7999332', // Eliza R (@eliza)
]);

export function isHiddenFromLeaderboard(athleteId: string, league: LeaderboardLeague): boolean {
  return league === 'run' && HIDDEN_RUN_LEADERBOARD_ATHLETE_IDS.has(athleteId);
}
