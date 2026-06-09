import engineLeagueAvatarFallback from '@/assets/engine-league-avatar-fallback.png';
import runLeagueAvatarFallback from '@/assets/run-league-avatar-fallback.png';

export type LeagueKind = 'engine' | 'run';

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

/** Athlete avatar URL; league contexts use the default badge when unset. */
export function athleteAvatarDisplayUrl(
  avatarUrl: string | null | undefined,
  league: LeagueKind | string | null | undefined,
): string | null {
  const trimmed = avatarUrl?.trim();
  if (trimmed) return trimmed;

  return leagueAvatarFallback(normalizeLeagueType(league ?? null));
}
