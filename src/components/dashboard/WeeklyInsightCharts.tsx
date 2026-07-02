import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatScore } from '@/lib/formatScore';

export const ENGINE_CHART_COLOR = 'hsl(72 100% 50%)';
export const RUN_CHART_COLOR = 'hsl(187 85% 53%)';

type StackKeys = {
  engineKey: string;
  runKey: string;
};

type WeeklyStackedAreaChartProps = {
  data: Record<string, string | number>[];
  stack: StackKeys;
  height?: number;
  valueSuffix?: string;
  formatValue?: (value: number) => string;
  className?: string;
  /** Hover tooltip on chart (off for dashboard preview card). */
  showTooltip?: boolean;
  /** Show only one league's series (Engine/Run toggle on dashboard preview). */
  singleLeague?: 'engine' | 'run';
};

/** @deprecated Use {@link WeeklyStackedAreaChart}. */
export type WeeklyStackedBarChartProps = WeeklyStackedAreaChartProps;

const Y_AXIS_TICK_COUNT = 4;

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const fraction = rawStep / magnitude;
  const niceFraction =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

/** Evenly spaced ticks from 0 with a padded ceiling aligned to the step. */
function buildYAxisScale(
  maxValue: number,
  allowDecimals: boolean,
): { domain: [number, number]; ticks: number[] } {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    const fallback = allowDecimals ? 1 : 4;
    const step = fallback / (Y_AXIS_TICK_COUNT - 1);
    const ticks = Array.from({ length: Y_AXIS_TICK_COUNT }, (_, i) =>
      allowDecimals ? Math.round(i * step * 10) / 10 : i * step,
    );
    return { domain: [0, fallback], ticks };
  }

  const intervals = Y_AXIS_TICK_COUNT - 1;
  const step = niceStep((maxValue * 1.08) / intervals);
  const niceMax = step * intervals;
  const ticks = Array.from({ length: Y_AXIS_TICK_COUNT }, (_, i) => {
    const value = i * step;
    if (!allowDecimals) return Math.round(value);
    return Math.round(value * 10) / 10;
  });
  return { domain: [0, niceMax], ticks };
}

function chartMaxValue(
  data: Record<string, string | number>[],
  engineKey: string,
  runKey: string,
  singleLeague?: 'engine' | 'run',
): number {
  let max = 0;
  for (const row of data) {
    const engine = Number(row[engineKey]) || 0;
    const run = Number(row[runKey]) || 0;
    const total =
      singleLeague === 'engine' ? engine : singleLeague === 'run' ? run : engine + run;
    max = Math.max(max, total);
  }
  return max;
}

/** Compact axis ticks — numbers only; units live in the card subtitle. */
function formatYAxisTick(value: number, allowDecimals: boolean): string {
  if (!Number.isFinite(value)) return '';
  if (allowDecimals) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  return String(Math.round(value));
}

function defaultFormat(value: number, suffix: string): string {
  if (suffix === ' min') return `${Math.round(value)}`;
  return formatScore(value);
}

function ChartTooltip({
  active,
  payload,
  label,
  valueSuffix = '',
  formatValue,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string }[];
  label?: string;
  valueSuffix?: string;
  formatValue?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const fmt = formatValue ?? ((v: number) => defaultFormat(v, valueSuffix));
  const visible = payload.filter((entry) => Number(entry.value) > 0);
  if (!visible.length) return null;

  return (
    <div className="rounded-lg border border-border/80 bg-[hsla(0,0%,8%,0.95)] px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {visible.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-semibold text-foreground tabular-nums">
              {fmt(entry.value)}
              {valueSuffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WeeklyStackedAreaChart({
  data,
  stack,
  height = 120,
  valueSuffix = '',
  formatValue,
  className,
  showTooltip = true,
  singleLeague,
}: WeeklyStackedAreaChartProps) {
  const engineFillId = useId();
  const runFillId = useId();
  const showAllTicks = data.length <= 7;
  const showEngine = !singleLeague || singleLeague === 'engine';
  const showRun = !singleLeague || singleLeague === 'run';
  const allowDecimals = valueSuffix === ' ppm';
  const stackId = singleLeague ? undefined : 'week';
  // Monotone Run fill can bleed cyan onto engine-only days when run=0; omit those points instead of linear curves.
  const isStacked = stackId != null;
  const areaCurve = 'monotone';

  const chartData = useMemo(() => {
    if (!isStacked) return data;
    return data.map((row) => {
      const next = { ...row };
      const runVal = Number(row[stack.runKey]);
      if (!Number.isFinite(runVal) || runVal <= 0) {
        next[stack.runKey] = null as unknown as string | number;
      }
      return next;
    });
  }, [data, isStacked, stack.runKey]);

  const yAxis = useMemo(() => {
    const maxValue = chartMaxValue(chartData, stack.engineKey, stack.runKey, singleLeague);
    return buildYAxisScale(maxValue, allowDecimals);
  }, [allowDecimals, chartData, singleLeague, stack.engineKey, stack.runKey]);

  const yAxisWidth = useMemo(() => {
    const widest = yAxis.ticks.reduce((max, tick) => {
      const label = formatYAxisTick(tick, allowDecimals);
      return Math.max(max, label.length);
    }, 1);
    return Math.max(24, widest * 7 + 6);
  }, [allowDecimals, yAxis.ticks]);

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 6, right: 4, left: 0, bottom: showAllTicks ? 4 : 0 }}
        >
          <defs>
            <linearGradient id={engineFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ENGINE_CHART_COLOR} stopOpacity={0.45} />
              <stop offset="95%" stopColor={ENGINE_CHART_COLOR} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id={runFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RUN_CHART_COLOR} stopOpacity={0.45} />
              <stop offset="95%" stopColor={RUN_CHART_COLOR} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(0,0%,100%,0.06)" />
          <XAxis
            dataKey="dayLabel"
            tick={{ fill: 'hsl(0 0% 55%)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={showAllTicks ? 0 : 'preserveStartEnd'}
            minTickGap={showAllTicks ? 0 : 12}
          />
          <YAxis
            tick={{ fill: 'hsl(0 0% 55%)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            allowDecimals={allowDecimals}
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            tickMargin={2}
            tickFormatter={(value) => formatYAxisTick(Number(value), allowDecimals)}
          />
          {showTooltip ? (
            <Tooltip
              content={<ChartTooltip valueSuffix={valueSuffix} formatValue={formatValue} />}
              cursor={{ stroke: 'hsla(0,0%,100%,0.12)', strokeWidth: 1 }}
            />
          ) : null}
          {showEngine ? (
            <Area
              type={areaCurve}
              dataKey={stack.engineKey}
              name="Engine"
              stackId={stackId}
              stroke={ENGINE_CHART_COLOR}
              strokeWidth={isStacked ? 1.5 : 2}
              fill={`url(#${engineFillId})`}
              dot={false}
              activeDot={
                isStacked
                  ? false
                  : { r: 3, fill: ENGINE_CHART_COLOR, stroke: '#0a0a0a', strokeWidth: 1.5 }
              }
            />
          ) : null}
          {showRun ? (
            <Area
              type={areaCurve}
              dataKey={stack.runKey}
              name="Run"
              stackId={stackId}
              stroke={isStacked ? 'none' : RUN_CHART_COLOR}
              strokeWidth={isStacked ? 0 : 2}
              fill={`url(#${runFillId})`}
              connectNulls={false}
              dot={false}
              activeDot={
                isStacked
                  ? false
                  : { r: 3, fill: RUN_CHART_COLOR, stroke: '#0a0a0a', strokeWidth: 1.5 }
              }
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** @deprecated Use {@link WeeklyStackedAreaChart}. */
export const WeeklyStackedBarChart = WeeklyStackedAreaChart;

type WeeklyTrendLineChartProps = {
  data: Record<string, string | number>[];
  dataKey: string;
  color?: string;
  height?: number;
  valueSuffix?: string;
};

export function WeeklyTrendLineChart({
  data,
  dataKey,
  color = ENGINE_CHART_COLOR,
  height = 200,
  valueSuffix = '',
}: WeeklyTrendLineChartProps) {
  const fillId = useId();

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="95%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(0,0%,100%,0.06)" />
          <XAxis
            dataKey="dayLabel"
            tick={{ fill: 'hsl(0 0% 55%)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={{ fill: 'hsl(0 0% 45%)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickCount={4}
            domain={[0, 'auto']}
          />
          <Tooltip
            content={
              <ChartTooltip
                valueSuffix={valueSuffix}
                formatValue={(v) => (valueSuffix === ' min' ? String(Math.round(v)) : formatScore(v))}
              />
            }
            cursor={{ stroke: 'hsla(0,0%,100%,0.12)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${fillId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: '#0a0a0a', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyDualTrendLineChart({
  data,
  engineKey,
  runKey,
  height = 200,
  valueSuffix = '',
}: {
  data: Record<string, string | number>[];
  engineKey: string;
  runKey: string;
  height?: number;
  valueSuffix?: string;
}) {
  const engineFillId = useId();
  const runFillId = useId();

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={engineFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ENGINE_CHART_COLOR} stopOpacity={0.4} />
              <stop offset="95%" stopColor={ENGINE_CHART_COLOR} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id={runFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RUN_CHART_COLOR} stopOpacity={0.4} />
              <stop offset="95%" stopColor={RUN_CHART_COLOR} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(0,0%,100%,0.06)" />
          <XAxis
            dataKey="dayLabel"
            tick={{ fill: 'hsl(0 0% 55%)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={{ fill: 'hsl(0 0% 45%)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickCount={4}
            domain={[0, 'auto']}
          />
          <Tooltip
            content={<ChartTooltip valueSuffix={valueSuffix} />}
            cursor={{ stroke: 'hsla(0,0%,100%,0.12)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey={engineKey}
            name="Engine"
            stroke={ENGINE_CHART_COLOR}
            strokeWidth={2}
            fill={`url(#${engineFillId})`}
            dot={false}
            activeDot={{ r: 4, fill: ENGINE_CHART_COLOR, stroke: '#0a0a0a', strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey={runKey}
            name="Run"
            stroke={RUN_CHART_COLOR}
            strokeWidth={2}
            fill={`url(#${runFillId})`}
            dot={false}
            activeDot={{ r: 4, fill: RUN_CHART_COLOR, stroke: '#0a0a0a', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
