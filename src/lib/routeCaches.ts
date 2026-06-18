/** In-memory caches so tab switches show stale data instantly while refreshing. */

export type DashboardCache = {
  season: unknown;
  stats: unknown;
  recentActivities: unknown;
  weeklyInsights: unknown;
  insightsSummary: unknown;
  lastSynced: string | null;
  wearables: string[] | null;
  athleteMaxHr: number | string | null;
  athleteMaxHrSource: string | null;
  athleteId: string | undefined;
  authUserId: string | undefined;
  error: string | null;
};

export type LeaderboardCache = {
  seasons: unknown;
  selectedSeasonId: string | null;
  merged: unknown;
  currentUserId: string | null;
  myAthleteId: string | null;
  friendIds: string[];
  myDivision: string;
  activeLeague: 'engine' | 'run';
  scopeTab: 'open' | 'overall' | 'friends';
  countryFilter: string;
  genderFilter: 'all' | 'male' | 'female';
  error: string | null;
};

export type ProfileCache = {
  athlete: unknown;
  seasonStats: unknown;
  careerStats: unknown;
  standingPercent: number;
  topPercent: number;
  achievements: unknown;
};

let dashboardCache: DashboardCache | null = null;
let leaderboardCache: LeaderboardCache | null = null;
let profileCache: ProfileCache | null = null;

export function getDashboardCache(): DashboardCache | null {
  return dashboardCache;
}

export function setDashboardCache(cache: DashboardCache): void {
  dashboardCache = cache;
}

export function getLeaderboardCache(): LeaderboardCache | null {
  return leaderboardCache;
}

export function setLeaderboardCache(cache: LeaderboardCache): void {
  leaderboardCache = cache;
}

export function getProfileCache(): ProfileCache | null {
  return profileCache;
}

export function setProfileCache(cache: ProfileCache): void {
  profileCache = cache;
}

export function clearRouteCaches(): void {
  dashboardCache = null;
  leaderboardCache = null;
  profileCache = null;
}
