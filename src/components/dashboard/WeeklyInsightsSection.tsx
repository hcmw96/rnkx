import { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ENGINE_CHART_COLOR,
  RUN_CHART_COLOR,
  WeeklyDualTrendLineChart,
  WeeklyStackedBarChart,
  WeeklyTrendLineChart,
} from '@/components/dashboard/WeeklyInsightCharts';
import type { DailyWeekAggregate, WeeklyInsightsData } from '@/lib/dashboardWeeklyInsights';
import { formatInsightDateLabel, weekDeltaPercent } from '@/lib/dashboardWeeklyInsights';
import { formatScore, formatScorePts } from '@/lib/formatScore';
import { cn } from '@/lib/utils';

export type InsightCardKind = 'volume' | 'score' | 'efficiency';
type InsightTab = 'score' | 'volume' | 'efficiency';

type WeeklyInsightsSectionProps = {
  data: WeeklyInsightsData;
};

type CardConfig = {
  kind: InsightCardKind;
  tab: InsightTab;
  title: string;
  cardTitle: string;
  subtitle: string;
  summaryLabel: string;
  summaryValue: string;
  engineKey: keyof DailyWeekAggregate;
  runKey: keyof DailyWeekAggregate;
  valueSuffix: string;
  trendKey: string;
};

const INSIGHT_TABS: { id: InsightTab; label: string }[] = [
  { id: 'score', label: 'Score' },
  { id: 'volume', label: 'Volume' },
  { id: 'efficiency', label: 'Efficiency' },
];

function chartRows(days: DailyWeekAggregate[]) {
  return days.map((d) => ({
    ...d,
    total_minutes: d.engine_minutes + d.run_minutes,
    total_points: d.engine_points + d.run_points,
    total_efficiency:
      d.engine_minutes + d.run_minutes > 0
        ? (d.engine_points + d.run_points) / (d.engine_minutes + d.run_minutes)
        : 0,
  }));
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const delta = weekDeltaPercent(current, previous);
  if (delta == null) {
    return <span className="text-xs text-muted-foreground">No prior period data</span>;
  }
  const up = delta > 0;
  const down = delta < 0;
  const Icon = up ? TrendingUp : down ? TrendingDown : null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
        up && 'text-emerald-400',
        down && 'text-amber-400/90',
        !up && !down && 'text-muted-foreground',
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {delta >= 0 ? '+' : ''}
      {Math.round(delta)}% vs prior period
    </span>
  );
}

function BreakdownRow({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2.5">
      <span className={cn('text-sm font-medium', colorClass)}>{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function InsightDetailDialog({
  open,
  onOpenChange,
  config,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: CardConfig;
  data: WeeklyInsightsData;
}) {
  const rows = useMemo(() => chartRows(data.days), [data.days]);
  const { totals, prevTotals } = data;

  const currentTotal =
    config.kind === 'volume'
      ? totals.total_minutes
      : config.kind === 'score'
        ? totals.total_points
        : totals.avg_efficiency;

  const prevTotal =
    config.kind === 'volume'
      ? prevTotals.total_minutes
      : config.kind === 'score'
        ? prevTotals.total_points
        : prevTotals.avg_efficiency;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="fixed inset-0 left-0 top-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-0 p-0 sm:rounded-none pt-[var(--safe-area-top)] pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] pr-[var(--safe-area-right)] [&>button]:right-[calc(1rem+var(--safe-area-right))] [&>button]:top-[calc(1rem+var(--safe-area-top))]">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left">
          <DialogTitle className="type-section-label text-foreground">{config.cardTitle}</DialogTitle>
          <p className="text-sm text-muted-foreground">{config.subtitle}</p>
        </DialogHeader>

        <div className="flex-1 space-y-6 px-4 py-5 pb-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="type-section-label">{config.summaryLabel}</p>
              <p className="type-stat mt-1 text-foreground">{config.summaryValue}</p>
            </div>
            <DeltaBadge current={currentTotal} previous={prevTotal} />
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-4">
            <p className="type-section-label mb-3">{data.days.length}-day trend</p>
            {config.kind === 'efficiency' ? (
              <WeeklyDualTrendLineChart
                data={rows}
                engineKey="engine_efficiency"
                runKey="run_efficiency"
                height={220}
                valueSuffix=" ppm"
              />
            ) : (
              <WeeklyTrendLineChart
                data={rows}
                dataKey={config.trendKey}
                height={220}
                valueSuffix={config.valueSuffix}
                color={ENGINE_CHART_COLOR}
              />
            )}
          </div>

          <div className="rounded-xl border border-border/70 bg-card space-y-3 p-4">
            <p className="type-section-label">Period breakdown</p>
            {config.kind === 'volume' && (
              <>
                <BreakdownRow
                  label="Engine"
                  value={`${Math.round(totals.engine_minutes)} min`}
                  colorClass="text-neon-lime"
                />
                <BreakdownRow
                  label="Run"
                  value={`${Math.round(totals.run_minutes)} min`}
                  colorClass="text-secondary"
                />
              </>
            )}
            {config.kind === 'score' && (
              <>
                <BreakdownRow
                  label="Engine"
                  value={formatScorePts(totals.engine_points)}
                  colorClass="text-neon-lime"
                />
                <BreakdownRow
                  label="Run"
                  value={formatScorePts(totals.run_points)}
                  colorClass="text-secondary"
                />
              </>
            )}
            {config.kind === 'efficiency' && (
              <>
                <BreakdownRow
                  label="Engine"
                  value={
                    totals.engine_minutes > 0
                      ? `${formatScore(totals.engine_points / totals.engine_minutes)} ppm`
                      : '—'
                  }
                  colorClass="text-neon-lime"
                />
                <BreakdownRow
                  label="Run"
                  value={
                    totals.run_minutes > 0
                      ? `${formatScore(totals.run_points / totals.run_minutes)} ppm`
                      : '—'
                  }
                  colorClass="text-secondary"
                />
              </>
            )}
          </div>

          <div className="rounded-xl border border-border/70 bg-card space-y-2 p-4">
            <p className="type-section-label">Daily log</p>
            {data.days.map((day) => {
              const mins = day.engine_minutes + day.run_minutes;
              const pts = day.engine_points + day.run_points;
              const eff = mins > 0 ? pts / mins : 0;
              let detail = 'Rest day';
              if (config.kind === 'volume' && mins > 0) detail = `${Math.round(mins)} min`;
              if (config.kind === 'score' && pts > 0) detail = formatScorePts(pts);
              if (config.kind === 'efficiency' && mins > 0) detail = `${formatScore(eff)} ppm`;

              return (
                <div
                  key={day.date}
                  className="flex items-center justify-between border-b border-border/40 py-2 text-sm last:border-0"
                >
                  <span className="text-muted-foreground">{formatInsightDateLabel(day.date)}</span>
                  <span className="font-medium tabular-nums">{detail}</span>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WeeklyInsightsSection({ data }: WeeklyInsightsSectionProps) {
  const [activeTab, setActiveTab] = useState<InsightTab>('score');
  const [detailOpen, setDetailOpen] = useState(false);

  const chartData = useMemo(() => chartRows(data.days), [data.days]);
  const { totals } = data;
  const dayCount = data.days.length;

  const cards: CardConfig[] = useMemo(
    () => [
      {
        kind: 'score',
        tab: 'score',
        title: 'Score',
        cardTitle: 'Score',
        subtitle: `Last ${dayCount} days · points per day`,
        summaryLabel: 'This period',
        summaryValue: formatScorePts(totals.total_points),
        engineKey: 'engine_points',
        runKey: 'run_points',
        valueSuffix: ' pts',
        trendKey: 'total_points',
      },
      {
        kind: 'volume',
        tab: 'volume',
        title: 'Volume',
        cardTitle: 'Volume',
        subtitle: `Last ${dayCount} days · mins per day`,
        summaryLabel: 'This period',
        summaryValue: `${Math.round(totals.total_minutes)} min`,
        engineKey: 'engine_minutes',
        runKey: 'run_minutes',
        valueSuffix: ' min',
        trendKey: 'total_minutes',
      },
      {
        kind: 'efficiency',
        tab: 'efficiency',
        title: 'Efficiency',
        cardTitle: 'Efficiency',
        subtitle: `Last ${dayCount} days · points per minute`,
        summaryLabel: 'Period avg',
        summaryValue: `${formatScore(totals.avg_efficiency)} ppm`,
        engineKey: 'engine_efficiency',
        runKey: 'run_efficiency',
        valueSuffix: ' ppm',
        trendKey: 'total_efficiency',
      },
    ],
    [dayCount, totals],
  );

  const config = cards.find((c) => c.tab === activeTab) ?? cards[0];

  const hasChartData = chartData.some(
    (row) => Number(row[config.engineKey]) > 0 || Number(row[config.runKey]) > 0,
  );

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/60 bg-[hsla(0,0%,10%,1)] p-1">
        <div className="grid grid-cols-3 gap-0.5">
          {INSIGHT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-lg py-2.5 text-center text-xs font-semibold transition-colors',
                activeTab === tab.id
                  ? 'bg-muted text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground/90',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="w-full rounded-xl border border-border/70 bg-[hsla(0,0%,10%,1)] p-4 text-left transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-lime/40"
      >
        <div className="min-w-0">
          <p className="type-section-label text-foreground">{config.cardTitle}</p>
          <p className="mt-0.5 type-caption">{config.subtitle}</p>
        </div>

        {hasChartData ? (
          <>
            <div className="mt-3 -mx-1">
              <WeeklyStackedBarChart
                key={activeTab}
                data={chartData}
                stack={{ engineKey: config.engineKey as string, runKey: config.runKey as string }}
                height={140}
                valueSuffix={config.valueSuffix}
                showTooltip={false}
                formatValue={
                  config.kind === 'volume'
                    ? (v) => String(Math.round(v))
                    : (v) => formatScore(v)
                }
              />
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: ENGINE_CHART_COLOR }} />
                Engine
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: RUN_CHART_COLOR }} />
                Run
              </span>
            </div>
          </>
        ) : (
          <p className="mt-8 py-10 text-center text-sm text-muted-foreground">
            Sync workouts to light up your charts.
          </p>
        )}
      </button>

      <InsightDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        config={config}
        data={data}
      />
    </div>
  );
}
