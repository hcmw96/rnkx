import { AthleteAvatarImg } from '@/components/AthleteAvatarImg';
import type { WelcomeLeaderboardRow } from '@/data/mockAthletes';
import { WELCOME_LEADERBOARD_ROWS } from '@/data/mockAthletes';
import type { LeagueKind } from '@/lib/leagueAvatars';
import { cn } from '@/lib/utils';

type WelcomeLeaderboardPreviewProps = {
  rows?: WelcomeLeaderboardRow[];
  league?: LeagueKind;
  className?: string;
};

const LEAGUE_LABEL: Record<LeagueKind, string> = {
  run: 'Run League',
  engine: 'Engine League',
};

export function WelcomeLeaderboardPreview({
  rows = WELCOME_LEADERBOARD_ROWS,
  league = 'run',
  className,
}: WelcomeLeaderboardPreviewProps) {
  const isEngine = league === 'engine';

  return (
    <article
      className={cn(
        'mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-card/95 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md',
        className,
      )}
      aria-hidden
    >
      <header className="border-b border-border/60 px-4 py-3">
        <p className="type-section-label">{LEAGUE_LABEL[league]}</p>
        <p className="type-meta mt-0.5">Season leaderboard</p>
      </header>
      <ul className="divide-y divide-border/50 py-1">
        {rows.map((row) => (
          <li
            key={`${row.rank}-${row.username}`}
            className={cn(
              'mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2.5',
              row.isYou &&
                (isEngine
                  ? 'border border-neon-lime/40 bg-neon-lime/[0.08] ring-1 ring-neon-lime/15'
                  : 'border border-electric-cyan/40 bg-electric-cyan/[0.08] ring-1 ring-electric-cyan/15'),
            )}
          >
            <span
              className={cn(
                'type-rank w-7 shrink-0 text-center text-sm',
                row.rank === 1 ? 'text-neon-lime' : 'text-foreground',
              )}
            >
              {row.rank}
            </span>
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/80 bg-[hsla(0,0%,14%,1)]">
              <AthleteAvatarImg avatarUrl={row.avatarUrl} league={league} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-sm font-semibold', row.isYou ? 'text-white' : 'text-foreground')}>
                {row.displayName}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {row.isYou && row.delta != null ? (
                <p className="text-[11px] font-semibold text-neon-lime">▲{row.delta}</p>
              ) : null}
              <p
                className={cn(
                  'type-stat tabular-nums text-sm',
                  isEngine ? 'text-primary' : 'text-secondary',
                )}
              >
                {row.score}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
