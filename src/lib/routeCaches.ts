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
  timeline: unknown;
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

const STORAGE_PREFIX = 'rnkx.route.';
const CACHE_VERSION = 1;
const STORAGE_KEYS = ['dashboard', 'leaderboard', 'profile', 'friends', 'chat'] as const;

let dashboardCache: DashboardCache | null = null;
let leaderboardCache: LeaderboardCache | null = null;
let profileCache: ProfileCache | null = null;
let friendsCache: FriendsCache | null = null;
let chatCache: ChatCache | null = null;

function readStored<T>(key: (typeof STORAGE_KEYS)[number]): T | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; data?: T };
    if (parsed?.v !== CACHE_VERSION || parsed.data == null) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeStored(key: (typeof STORAGE_KEYS)[number], data: unknown): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ v: CACHE_VERSION, data }));
  } catch {
    // private mode / quota
  }
}

export function getDashboardCache(): DashboardCache | null {
  if (!dashboardCache) dashboardCache = readStored('dashboard');
  return dashboardCache;
}

export function setDashboardCache(cache: DashboardCache): void {
  dashboardCache = cache;
  writeStored('dashboard', cache);
}

export function getLeaderboardCache(): LeaderboardCache | null {
  if (!leaderboardCache) leaderboardCache = readStored('leaderboard');
  return leaderboardCache;
}

export function setLeaderboardCache(cache: LeaderboardCache): void {
  leaderboardCache = cache;
  writeStored('leaderboard', cache);
}

export function getProfileCache(): ProfileCache | null {
  if (!profileCache) profileCache = readStored('profile');
  return profileCache;
}

export function setProfileCache(cache: ProfileCache): void {
  profileCache = cache;
  writeStored('profile', cache);
}

export function getFriendsCache(): FriendsCache | null {
  if (!friendsCache) friendsCache = readStored('friends');
  return friendsCache;
}

export function setFriendsCache(cache: FriendsCache): void {
  friendsCache = cache;
  writeStored('friends', cache);
}

export function getChatCache(): ChatCache | null {
  if (!chatCache) chatCache = readStored('chat');
  return chatCache;
}

export function setChatCache(cache: ChatCache): void {
  chatCache = cache;
  writeStored('chat', cache);
}

export function clearRouteCaches(): void {
  dashboardCache = null;
  leaderboardCache = null;
  profileCache = null;
  friendsCache = null;
  chatCache = null;
  try {
    for (const key of STORAGE_KEYS) {
      sessionStorage.removeItem(STORAGE_PREFIX + key);
    }
  } catch {
    // ignore
  }
}
