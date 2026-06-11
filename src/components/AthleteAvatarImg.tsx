import { useState } from 'react';
import {
  PROFILE_AVATAR_FALLBACK,
  athleteAvatarDisplayUrl,
  athleteAvatarUsesFallback,
  type LeagueKind,
} from '@/lib/leagueAvatars';
import { cn } from '@/lib/utils';

type AthleteAvatarImgProps = {
  avatarUrl: string | null | undefined;
  league?: LeagueKind | string | null;
  className?: string;
};

/** Circular athlete profile photo with RNKX default when unset. */
export function AthleteAvatarImg({ avatarUrl, league, className }: AthleteAvatarImgProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const isFallback = loadFailed || athleteAvatarUsesFallback(avatarUrl);
  const src = loadFailed ? PROFILE_AVATAR_FALLBACK : athleteAvatarDisplayUrl(avatarUrl, league);

  return (
    <img
      src={src}
      alt=""
      onError={() => setLoadFailed(true)}
      className={cn(
        'h-full w-full',
        isFallback ? 'object-contain bg-black' : 'object-cover',
        className,
      )}
    />
  );
}
