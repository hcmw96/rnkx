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

type LeaderboardRowsProps = {
  rows: LeaderboardRowData[];
  currentUserId: string | null;
  friendIds: Set<string>;
};

export function LeaderboardRows({ rows, currentUserId, friendIds }: LeaderboardRowsProps) {
  return (
    <ul className="flex flex-col gap-1.5 px-0.5 pb-6">
      {rows.map((item) => {
        const isSelf = currentUserId != null && item.id === currentUserId;
        const initial = (item.username || item.displayName || '?').trim().charAt(0).toUpperCase() || '?';
        const flag = item.country ? (getCountryByName(item.country)?.flag ?? '') : '';
        const isFirst = item.rank === 1;
        const pointsInt = Number.isFinite(item.score) ? Math.round(item.score) : 0;
        const canViewProfile = friendIds.has(item.id) && !isSelf;

        const rowInner = (
          <>
            <span
              className={cn(
                'w-8 shrink-0 text-center font-display text-xl font-bold tabular-nums leading-none',
                isFirst ? 'text-neon-lime' : 'text-muted-foreground',
              )}
              aria-label={`Rank ${item.rank}`}
            >
              {item.rank}
            </span>
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border/80 bg-[hsla(0,0%,14%,1)]">
              {item.avatarUrl ? (
                <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-sans text-sm font-semibold text-muted-foreground">
                  {initial}
                </span>
              )}
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.username}</p>
            {flag ? (
              <span className="shrink-0 text-base leading-none" aria-hidden>
                {flag}
              </span>
            ) : null}
            <span
              className={cn(
                'shrink-0 font-display text-2xl font-bold leading-none tabular-nums',
                isFirst ? 'text-neon-lime' : 'text-foreground',
              )}
            >
              {pointsInt.toLocaleString()}
            </span>
          </>
        );

        const className = cn(
          'flex items-center gap-2.5 rounded-lg border bg-[hsla(0,0%,10%,1)] px-2.5 py-2 shadow-sm',
          isSelf ? 'border-neon-lime/50 ring-1 ring-neon-lime/20' : 'border-border/70',
          canViewProfile && 'transition-colors hover:border-neon-lime/30',
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
