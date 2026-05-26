import { Link } from 'react-router-dom';
import { getCountryByName } from '@/data/countries';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export type LeaderboardRowData = {
  id: string;
  rank: number;
  score: number;
  displayName: string;
  username: string;
  country: string | null;
  avatarUrl: string | null;
};

type LeaderboardLeague = 'engine' | 'run';

type LeaderboardRowsProps = {
  rows: LeaderboardRowData[];
  league: LeaderboardLeague;
  currentUserId: string | null;
  friendIds: Set<string>;
};

const LEAGUE_SCORE_CLASS: Record<LeaderboardLeague, string> = {
  engine: 'text-neon-lime',
  run: 'text-electric-cyan',
};

const LEAGUE_SELF_BORDER: Record<LeaderboardLeague, string> = {
  engine: 'border-neon-lime/50 ring-1 ring-neon-lime/20',
  run: 'border-electric-cyan/50 ring-1 ring-electric-cyan/20',
};

const LEAGUE_HOVER_BORDER: Record<LeaderboardLeague, string> = {
  engine: 'hover:border-neon-lime/30',
  run: 'hover:border-electric-cyan/30',
};

export function LeaderboardRows({ rows, league, currentUserId, friendIds }: LeaderboardRowsProps) {
  const scoreClass = LEAGUE_SCORE_CLASS[league];

  return (
    <ul className="flex flex-col gap-1.5 px-0.5 pb-6">
      {rows.map((item) => {
        const isSelf = currentUserId != null && item.id === currentUserId;
        const initial = (item.username || item.displayName || '?').trim().charAt(0).toUpperCase() || '?';
        const countryInfo = item.country ? getCountryByName(item.country) : null;
        const flag = countryInfo?.flag ?? '';
        const countryLabel = countryInfo?.name ?? item.country ?? '';
        const pointsInt = Number.isFinite(item.score) ? Math.round(item.score) : 0;
        const canViewProfile = friendIds.has(item.id) && !isSelf;

        const rowInner = (
          <>
            <span
              className="type-display-rank w-7 shrink-0 text-center text-muted-foreground"
              aria-label={`Rank ${item.rank}`}
            >
              {item.rank}
            </span>
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/80 bg-[hsla(0,0%,14%,1)]">
              {item.avatarUrl ? (
                <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-sans text-xs font-semibold text-muted-foreground">
                  {initial}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">@{item.username}</p>
              <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                {flag ? (
                  <span className="shrink-0 text-sm leading-none" aria-hidden>
                    {flag}
                  </span>
                ) : null}
                {countryLabel ? (
                  <span className="min-w-0 truncate">{countryLabel}</span>
                ) : (
                  <span className="text-muted-foreground/70">—</span>
                )}
                <span className="shrink-0 text-muted-foreground/50" aria-hidden>
                  ·
                </span>
                <span className={cn('shrink-0 font-display text-sm font-bold tabular-nums', scoreClass)}>
                  {pointsInt.toLocaleString()} pts
                </span>
              </p>
            </div>
          </>
        );

        const className = cn(
          'flex items-center gap-2 rounded-lg border bg-[hsla(0,0%,10%,1)] px-2.5 py-2 shadow-sm',
          isSelf ? LEAGUE_SELF_BORDER[league] : 'border-border/70',
          canViewProfile && cn('transition-colors', LEAGUE_HOVER_BORDER[league]),
        );

        return (
          <li key={item.id}>
            {canViewProfile ? (
              <Link to={`/app/friends/${item.id}`} className={className}>
                {rowInner}
              </Link>
            ) : (
              <div
                className={className}
                role={!isSelf ? 'button' : undefined}
                tabIndex={!isSelf ? 0 : undefined}
                onClick={() => {
                  if (isSelf) return;
                  toast.message('Add this athlete as a friend to view their profile.', {
                    description: 'Social → Friends → search by username',
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSelf) {
                    toast.message('Add this athlete as a friend to view their profile.');
                  }
                }}
              >
                {rowInner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
