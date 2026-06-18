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

export type FriendsCache = {
  incoming: unknown;
  outgoing: unknown;
  friends: unknown;
};

export type ChatCache = {
  items: unknown;
  athleteId: string | null;
};

let dashboardCache: DashboardCache | null = null;
let leaderboardCache: LeaderboardCache | null = null;
let profileCache: ProfileCache | null = null;
let friendsCache: FriendsCache | null = null;
let chatCache: ChatCache | null = null;

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

export function getFriendsCache(): FriendsCache | null {
  return friendsCache;
}

export function setFriendsCache(cache: FriendsCache): void {
  friendsCache = cache;
}

export function getChatCache(): ChatCache | null {
  return chatCache;
}

export function setChatCache(cache: ChatCache): void {
  chatCache = cache;
}

export function clearRouteCaches(): void {
  dashboardCache = null;
  leaderboardCache = null;
  profileCache = null;
  friendsCache = null;
  chatCache = null;
}
