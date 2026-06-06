import { ChevronUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatScore } from '@/lib/formatScore';
import { cn } from '@/lib/utils';

type Division = 'Open' | 'Challenger' | 'Pro' | 'Elite';
type League = 'engine' | 'run';

interface SeasonCardProps {
  seasonName: string;
  engineRank?: number | null;
  runRank?: number | null;
  enginePoints?: number;
  runPoints?: number;
  daysRemaining?: number;
  seasonStartsAt?: string | null;
  seasonEndsAt?: string | null;
  selectedLeagues?: string[];
  engineDivision?: Division;
  runDivision?: Division;
  engineWeeklyChange?: number | null;
  runWeeklyChange?: number | null;
}

function parseSeasonMeta(seasonName: string): { label: string; subtitle: string | null } {
  if (seasonName.includes(' - ')) {
    const [primary, secondary] = seasonName.split(' - ', 2);
    return {
      label: primary.trim().toUpperCase(),
      subtitle: secondary.trim().toUpperCase(),
    };
  }
  return { label: seasonName.trim().toUpperCase(), subtitle: null };
}

function seasonProgress(startsAt: string | null | undefined, endsAt: string | null | undefined) {
  if (!startsAt || !endsAt) return null;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
  const currentDay = Math.min(totalDays, Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24))));
  const daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  const progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));

  return { totalDays, currentDay, daysRemaining, progress };
}

function formatRank(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank)) return '—';
  return `#${Math.round(rank).toLocaleString()}`;
}

function trendLabel(weeklyChange: number | null | undefined): { label: string; rising: boolean; falling: boolean } {
  if (weeklyChange == null || weeklyChange === 0) {
    return { label: 'Holding', rising: false, falling: false };
  }
  if (weeklyChange > 0) return { label: 'Rising', rising: true, falling: false };
  return { label: 'Falling', rising: false, falling: true };
}

type LeagueSeasonRowProps = {
  league: League;
  division: Division;
  points: number;
  rank: number | null | undefined;
  weeklyChange: number | null | undefined;
};

function LeagueSeasonRow({ league, division, points, rank, weeklyChange }: LeagueSeasonRowProps) {
  const isEngine = league === 'engine';
  const leagueLabel = isEngine ? 'Engine' : 'Run';
  const letter = isEngine ? 'E' : 'R';
  const trend = trendLabel(weeklyChange);
  const TrendIcon = trend.falling ? TrendingDown : ChevronUp;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-[hsla(0,0%,10%,1)] px-3 py-3',
        isEngine ? 'border-neon-lime/45' : 'border-secondary/45',
      )}
    >
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-[hsla(0,0%,8%,1)] font-display text-lg font-bold',
          isEngine ? 'border-neon-lime/50 text-neon-lime' : 'border-secondary/50 text-secondary',
        )}
        aria-hidden
      >
        {letter}
      </div>

      <div className="min-w-0 flex-1">
        <p className="type-heading truncate">
          {leagueLabel} · {division}
        </p>
        <p className="type-meta mt-0.5 tabular-nums">{formatScore(points)} pts</p>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn('font-display text-2xl font-bold leading-none tabular-nums', isEngine ? 'text-neon-lime' : 'text-secondary')}>
          {formatRank(rank)}
        </p>
        <p
          className={cn(
            'mt-1 flex items-center justify-end gap-0.5 text-[11px] font-medium',
            trend.falling ? 'text-rose-400' : 'text-emerald-400',
          )}
        >
          <TrendIcon className="h-3 w-3" aria-hidden />
          {trend.label}
        </p>
      </div>
    </div>
  );
}

export function SeasonCard({
  seasonName,
  engineRank,
  runRank,
  enginePoints = 0,
  runPoints = 0,
  daysRemaining,
  seasonStartsAt,
  seasonEndsAt,
  selectedLeagues = [],
  engineDivision = 'Open',
  runDivision = 'Open',
  engineWeeklyChange = null,
  runWeeklyChange = null,
}: SeasonCardProps) {
  const showEngine = selectedLeagues.length === 0 || selectedLeagues.includes('engine');
  const showRun = selectedLeagues.length === 0 || selectedLeagues.includes('run');
  const meta = parseSeasonMeta(seasonName);
  const progress = seasonProgress(seasonStartsAt, seasonEndsAt ?? null);
  const endDays = daysRemaining ?? progress?.daysRemaining;

  const leagueRows: LeagueSeasonRowProps[] = [];
  if (showEngine) {
    leagueRows.push({
      league: 'engine',
      division: engineDivision,
      points: enginePoints,
      rank: engineRank,
      weeklyChange: engineWeeklyChange,
    });
  }
  if (showRun) {
    leagueRows.push({
      league: 'run',
      division: runDivision,
      points: runPoints,
      rank: runRank,
      weeklyChange: runWeeklyChange,
    });
  }

  return (
    <Card className="card-elevated space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="type-section-label leading-snug">
          {meta.subtitle ? `${meta.label} · ${meta.subtitle}` : meta.label}
        </p>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neon-lime/40 bg-neon-lime/10 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-neon-lime" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-wider text-neon-lime">Live</span>
        </span>
      </div>

      <h2 className="font-display text-3xl font-normal leading-none tracking-wide text-foreground">Live now</h2>

      <div className="flex flex-col space-y-2.5">
        {leagueRows.map((row) => (
          <LeagueSeasonRow key={row.league} {...row} />
        ))}
      </div>

      {progress ? (
        <div className="space-y-2 pt-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-neon-lime via-emerald-400 to-secondary"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="tabular-nums">
              Day {progress.currentDay} / {progress.totalDays}
            </span>
            <span>
              {endDays != null && endDays > 0
                ? `Ends in ${endDays} day${endDays === 1 ? '' : 's'}`
                : endDays === 0
                  ? 'Ends today'
                  : 'Season ended'}
            </span>
          </div>
        </div>
      ) : endDays != null ? (
        <p className="text-center text-sm text-muted-foreground">
          {endDays > 0 ? `Season ends in ${endDays} day${endDays === 1 ? '' : 's'}` : 'Season ended'}
        </p>
      ) : null}
    </Card>
  );
}
