import {
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
  const isFallback = athleteAvatarUsesFallback(avatarUrl);

  return (
    <img
      src={athleteAvatarDisplayUrl(avatarUrl, league)}
      alt=""
      className={cn(
        'h-full w-full',
        isFallback ? 'object-contain bg-black' : 'object-cover',
        className,
      )}
    />
  );
}
