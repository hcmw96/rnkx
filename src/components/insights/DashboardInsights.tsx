import { TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { InsightsLineChart } from '@/components/insights/InsightsLineChart';
import {
  buildInsightsSummary,
  type InsightActivity,
  PREVIEW_TREND_POINTS,
} from '@/lib/insightsAggregates';
import { cn } from '@/lib/utils';

const LIME = 'hsl(72 100% 50%)';
const CYAN = 'hsl(187 85% 53%)';
const AMBER = 'hsl(38 92% 50%)';

type AthleteStatsSlice = {
  engine_rank: number | null;
  run_rank: number | null;
  engine_weekly_change: number | null;
  run_weekly_change: number | null;
  selected_leagues: string[] | null;
};

type DashboardInsightsProps = {
  activities: InsightActivity[];
  stats: AthleteStatsSlice | null;
};

function RankPill({
  label,
  rank,
  weeklyChange,
}: {
  label: string;
  rank: number | null;
  weeklyChange: number | null;
}) {
  const up = weeklyChange != null && weeklyChange > 0;
  const down = weeklyChange != null && weeklyChange < 0;
  return (
    <div className="flex-1 rounded-xl border border-border/60 bg-[hsla(0,0%,8%,1)] px-3 py-3">
      <p className="type-section-label">{label}</p>
      <p className="type-stat mt-1 text-foreground">
        {rank != null ? `#${rank.toLocaleString()}` : '—'}
      </p>
      {weeklyChange != null ? (
        <p
          className={cn(
            'mt-1 flex items-center gap-1 text-xs font-medium',
            up && 'text-emerald-400',
            down && 'text-amber-400/90',
            !up && !down && 'text-muted-foreground',
          )}
        >
          {up ? <TrendingUp className="h-3.5 w-3.5" /> : down ? <TrendingDown className="h-3.5 w-3.5" /> : null}
          {weeklyChange >= 0 ? '+' : ''}
          {weeklyChange} places vs last week
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No movement data yet</p>
      )}
    </div>
  );
}

export function DashboardInsights({ activities, stats }: DashboardInsightsProps) {
  const summary = buildInsightsSummary(activities, 14);
  const leagues = stats?.selected_leagues ?? ['engine', 'run'];
  const showEngine = leagues.includes('engine');
  const showRun = leagues.includes('run');

  const momentumData = summary.daily.map((d) => ({
    label: d.label,
    Engine: Math.round(d.enginePts),
    Run: Math.round(d.runPts),
    Total: Math.round(d.totalPts),
  }));

  const cumulativeData = summary.cumulative;
  const volumeData = summary.daily.map((d) => ({
    label: d.label,
    Minutes: Math.round(d.minutes),
  }));

  const intensityData = summary.daily
    .filter((d) => d.avgHrPercent != null)
    .map((d) => ({
      label: d.label,
      Intensity: d.avgHrPercent as number,
    }));

  const hasChartData = summary.weekSessions > 0;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="type-section-label">Insights</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Your performance story — scoring trends, intensity, and standout sessions.
        </p>
      </div>

      {/* Rank + weekly movement */}
      <div className="rounded-xl border border-border/70 bg-[hsla(0,0%,10%,1)] p-4">
        <p className="type-section-label">Leaderboard position</p>
        <div className="mt-3 flex gap-2">
          {showEngine ? (
            <RankPill
              label="Engine"
              rank={stats?.engine_rank ?? null}
              weeklyChange={stats?.engine_weekly_change ?? null}
            />
          ) : null}
          {showRun ? (
            <RankPill label="Run" rank={stats?.run_rank ?? null} weeklyChange={stats?.run_weekly_change ?? null} />
          ) : null}
        </div>
      </div>

      {/* Scoring momentum — area chart */}
      <div className="rounded-xl border border-border/70 bg-[hsla(0,0%,10%,1)] p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="type-heading">Scoring momentum</p>
            <p className="text-xs text-muted-foreground">Daily points · last 14 days</p>
          </div>
          {summary.weekDelta !== 0 ? (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                summary.weekDelta > 0
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-amber-500/15 text-amber-400',
              )}
            >
              {summary.weekDelta > 0 ? '+' : ''}
              {summary.weekDelta} wk
            </span>
          ) : null}
        </div>
        {hasChartData ? (
          <InsightsLineChart
            className="mt-4"
            height={200}
            data={momentumData}
            variant="area"
            valueSuffix=" pts"
            series={[
              ...(showEngine ? [{ dataKey: 'Engine', label: 'Engine', color: LIME, fillId: 'insightEngine' }] : []),
              ...(showRun ? [{ dataKey: 'Run', label: 'Run', color: CYAN, fillId: 'insightRun' }] : []),
            ]}
          />
        ) : (
          <EmptyChartHint />
        )}
      </div>

      {/* Season points curve */}
      <div className="rounded-xl border border-border/70 bg-[hsla(0,0%,10%,1)] p-4">
        <p className="type-heading">Season points curve</p>
        <p className="text-xs text-muted-foreground">Cumulative scored points this fortnight</p>
        {hasChartData ? (
          <InsightsLineChart
            className="mt-4"
            height={180}
            data={cumulativeData}
            variant="line"
            valueSuffix=" pts"
            series={[{ dataKey: 'total', label: 'Total', color: LIME }]}
          />
        ) : (
          <EmptyChartHint />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Training volume */}
        <div className="rounded-xl border border-border/70 bg-[hsla(0,0%,10%,1)] p-4">
          <p className="type-heading">Training volume</p>
          <p className="text-xs text-muted-foreground">Minutes per day</p>
          {hasChartData ? (
            <InsightsLineChart
              className="mt-3"
              height={160}
              data={volumeData}
              variant="area"
              valueSuffix=" min"
              series={[{ dataKey: 'Minutes', label: 'Minutes', color: CYAN, fillId: 'insightVolume' }]}
            />
          ) : (
            <EmptyChartHint compact />
          )}
        </div>

        {/* HR intensity */}
        <div className="rounded-xl border border-border/70 bg-[hsla(0,0%,10%,1)] p-4">
          <p className="type-heading">Engine intensity</p>
          <p className="text-xs text-muted-foreground">Avg % of max HR</p>
          {intensityData.length > 0 ? (
            <InsightsLineChart
              className="mt-3"
              height={160}
              data={intensityData}
              variant="line"
              valueSuffix="%"
              yDomain={[40, 100]}
              series={[{ dataKey: 'Intensity', label: 'Intensity', color: AMBER }]}
            />
          ) : (
            <EmptyChartHint compact />
          )}
        </div>
      </div>

      {/* Session breakdowns */}
      <div className="rounded-xl border border-border/70 bg-[hsla(0,0%,10%,1)] p-4">
        <p className="type-section-label">Top sessions</p>
        {!summary.topSessions.length ? (
          <p className="mt-2 text-sm text-muted-foreground">No scored workouts yet — sync to see breakdowns.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {summary.topSessions.slice(0, 3).map((session, i) => (
              <li
                key={session.id}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-sans text-xs font-semibold',
                      i === 0 ? 'bg-neon-lime/20 text-neon-lime' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate type-heading">{session.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.duration} min · {session.leagueType === 'run' ? 'Run' : 'Engine'}
                    </p>
                  </div>
                </div>
                <span className="ml-2 shrink-0 type-stat text-neon-lime">
                  {session.score.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Smart insights */}
      <div className="rounded-xl border border-neon-lime/30 bg-gradient-to-br from-[hsla(72,35%,10%,0.5)] to-[hsla(0,0%,8%,1)] p-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-neon-lime" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wide text-neon-lime">Coach notes</p>
        </div>
        <ul className="mt-3 space-y-2">
          {summary.insightLines.map((line) => (
            <li key={line} className="text-sm leading-relaxed text-foreground/90">
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EmptyChartHint({ compact }: { compact?: boolean }) {
  return (
    <p className={cn('text-center text-sm text-muted-foreground', compact ? 'mt-8 py-6' : 'mt-10 py-12')}>
      Sync workouts to light up your charts.
    </p>
  );
}

/** Blurred preview for PremiumGate — matches live chart styling. */
export function InsightsPreviewChart() {
  const data = PREVIEW_TREND_POINTS.map((p) => ({ label: p.label, total: p.total }));
  return (
    <div className="min-h-[220px] bg-zinc-950/90 px-3 py-5">
      <div className="mb-3 flex gap-2">
        <div className="h-8 flex-1 rounded-lg bg-muted/30" />
        <div className="h-8 w-20 rounded-lg bg-muted/25" />
      </div>
      <InsightsLineChart
        height={160}
        data={data}
        variant="area"
        series={[{ dataKey: 'total', label: 'Points', color: LIME, fillId: 'previewInsight' }]}
      />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="h-16 rounded-lg bg-muted/20" />
        <div className="h-16 rounded-lg bg-muted/20" />
      </div>
    </div>
  );
}
