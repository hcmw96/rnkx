import { Lock } from 'lucide-react';
import { AthleteAvatarImg } from '@/components/AthleteAvatarImg';
import { LeagueChevronLogo } from '@/components/leagues/LeagueChevronLogo';
import type { WelcomeLeaderboardRow } from '@/data/mockAthletes';
import { MOCK_ATHLETES } from '@/data/mockAthletes';
import { cn } from '@/lib/utils';

function rowFromAthlete(
  rank: number,
  athlete: (typeof MOCK_ATHLETES)[keyof typeof MOCK_ATHLETES],
  score: string,
  extra?: Pick<WelcomeLeaderboardRow, 'isYou' | 'delta'>,
): WelcomeLeaderboardRow {
  return {
    rank,
    username: athlete.username,
    displayName: athlete.displayName,
    avatarUrl: athlete.avatarUrl,
    score,
    ...extra,
  };
}

export const WELCOME_PRIVATE_GROUP_ROWS: WelcomeLeaderboardRow[] = [
  rowFromAthlete(1, MOCK_ATHLETES.finnHarper, '2,847'),
  {
    rank: 2,
    username: 'you',
    displayName: 'You',
    avatarUrl: null,
    score: '2,801',
    isYou: true,
    delta: 1,
  },
  rowFromAthlete(3, MOCK_ATHLETES.islaDavies, '2,654'),
  rowFromAthlete(4, MOCK_ATHLETES.samuelWright, '2,401'),
  rowFromAthlete(5, MOCK_ATHLETES.rubyKane, '2,188'),
];

type WelcomePrivateGroupPreviewProps = {
  /** Tighter layout for welcome carousel viewport */
  compact?: boolean;
  className?: string;
};

export function WelcomePrivateGroupPreview({ compact = false, className }: WelcomePrivateGroupPreviewProps) {
  const faceStack = [
    MOCK_ATHLETES.finnHarper,
    MOCK_ATHLETES.islaDavies,
    MOCK_ATHLETES.connorOShea,
  ];
  const rows = compact ? WELCOME_PRIVATE_GROUP_ROWS.slice(0, 3) : WELCOME_PRIVATE_GROUP_ROWS;

  return (
    <article
      className={cn(
        'mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-card/95 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md',
        className,
      )}
      aria-hidden
    >
      <header className={cn('border-b border-border/60 px-4', compact ? 'py-2.5' : 'py-3')}>
        <div className="flex items-start gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-border/80 bg-[hsla(0,0%,14%,1)]">
            <LeagueChevronLogo className="h-full w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="type-heading truncate text-sm">Hyde Park Run Crew</p>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Lock className="h-2.5 w-2.5" aria-hidden />
                Private
              </span>
            </div>
            <p className="type-meta mt-0.5">8 members · Run</p>
          </div>
        </div>
        {!compact ? (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex -space-x-2">
              {faceStack.map((member) => (
                <div
                  key={member.username}
                  className="relative h-7 w-7 overflow-hidden rounded-full border-2 border-card ring-1 ring-border/40"
                >
                  <AthleteAvatarImg avatarUrl={member.avatarUrl} league="run" />
                </div>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">+5 more in your crew</span>
          </div>
        ) : null}
      </header>

      <div className={cn('px-4', compact ? 'py-1' : 'py-2')}>
        <p className="type-section-label">Club leaderboard</p>
      </div>

      <ul className={cn('divide-y divide-border/50', compact ? 'pb-0.5' : 'pb-1')}>
        {rows.map((row) => (
          <li
            key={`${row.rank}-${row.username}`}
            className={cn(
              'mx-2 flex items-center gap-2.5 rounded-lg px-2',
              compact ? 'py-1.5' : 'py-2.5',
              row.isYou && 'border border-electric-cyan/40 bg-electric-cyan/[0.08] ring-1 ring-electric-cyan/15',
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
            <div className={cn('relative shrink-0 overflow-hidden rounded-full border border-border/80 bg-[hsla(0,0%,14%,1)]', compact ? 'h-8 w-8' : 'h-9 w-9')}>
              <AthleteAvatarImg avatarUrl={row.avatarUrl} league="run" />
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
              <p className="type-stat tabular-nums text-sm text-secondary">{row.score}</p>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
