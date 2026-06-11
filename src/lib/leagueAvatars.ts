import engineLeagueAvatarFallback from '@/assets/engine-league-avatar-fallback.png';
import profileAvatarFallback from '@/assets/profile-avatar-fallback.png';
import runLeagueAvatarFallback from '@/assets/run-league-avatar-fallback.png';

export type LeagueKind = 'engine' | 'run';

export const PROFILE_AVATAR_FALLBACK = profileAvatarFallback;
export const RUN_LEAGUE_AVATAR_FALLBACK = runLeagueAvatarFallback;
export const ENGINE_LEAGUE_AVATAR_FALLBACK = engineLeagueAvatarFallback;

function normalizeLeagueType(value: string | null | undefined): LeagueKind | null {
  if (value === 'run') return 'run';
  if (value === 'engine') return 'engine';
  return null;
}

function leagueAvatarFallback(league: LeagueKind | null): string | null {
  if (league === 'run') return RUN_LEAGUE_AVATAR_FALLBACK;
  if (league === 'engine') return ENGINE_LEAGUE_AVATAR_FALLBACK;
  return null;
}

/** Primary league for profile avatars when the athlete has no custom photo. */
export function leagueFromSelectedLeagues(
  selectedLeagues: string[] | null | undefined,
): LeagueKind | null {
  const leagues = selectedLeagues ?? [];
  if (leagues.includes('run')) return 'run';
  if (leagues.includes('engine')) return 'engine';
  return null;
}

type ClubImageOptions = { cacheKey?: string; leagueType?: LeagueKind | string | null };

/** Profile/club image URL with optional cache-bust; league clubs fall back to the default badge. */
export function clubImageDisplayUrl(
  imageUrl: string | null | undefined,
  cacheKeyOrOptions?: string | ClubImageOptions,
): string | null {
  const options: ClubImageOptions =
    typeof cacheKeyOrOptions === 'string' ? { cacheKey: cacheKeyOrOptions } : (cacheKeyOrOptions ?? {});

  const trimmed = imageUrl?.trim();
  if (trimmed) {
    const key = options.cacheKey ?? trimmed;
    const sep = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${sep}v=${encodeURIComponent(key)}`;
  }

  return leagueAvatarFallback(normalizeLeagueType(options.leagueType ?? null));
}

const BLOCKED_AVATAR_HOSTS = ['ui-avatars.com'];

function isBlockedAvatarHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return BLOCKED_AVATAR_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return true;
  }
}

/** Normalised custom avatar URL, or null when unset / blocked third-party host. */
export function resolveAthleteAvatarUrl(avatarUrl: string | null | undefined): string | null {
  const trimmed = avatarUrl?.trim();
  if (!trimmed || isBlockedAvatarHost(trimmed)) return null;
  return trimmed;
}

/** Athlete profile photo URL; uses the RNKX mark when no custom photo is set. */
export function athleteAvatarDisplayUrl(
  avatarUrl: string | null | undefined,
  _league?: LeagueKind | string | null,
): string {
  return resolveAthleteAvatarUrl(avatarUrl) || PROFILE_AVATAR_FALLBACK;
}

export function athleteAvatarUsesFallback(avatarUrl: string | null | undefined): boolean {
  return resolveAthleteAvatarUrl(avatarUrl) == null;
}
