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
import {
  AREA_FLOOR_OPACITY,
  AREA_PEAK_OPACITY,
  CHART_ACTIVE_DOT_STROKE,
  CHART_AXIS_TICK,
  CHART_CURSOR_STROKE,
  CHART_GRID_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TOOLTIP_CLASS,
  ENGINE_CHART_COLOR,
  RUN_CHART_COLOR,
} from '@/lib/chartTheme';
import { cn } from '@/lib/utils';
import { formatScore } from '@/lib/formatScore';

export { ENGINE_CHART_COLOR, RUN_CHART_COLOR };

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

/** Max of each series independently — overlapping areas, not stacked totals. */
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
    if (singleLeague === 'engine') max = Math.max(max, engine);
    else if (singleLeague === 'run') max = Math.max(max, run);
    else max = Math.max(max, engine, run);
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
    <div className={CHART_TOOLTIP_CLASS}>
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

/** Dual overlapping area chart (SCORE style) — Engine + Run from a shared zero baseline. */
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
  const gradientPrefix = useId().replace(/:/g, '');
  const engineFillId = `${gradientPrefix}-engine`;
  const runFillId = `${gradientPrefix}-run`;
  const showAllTicks = data.length <= 7;
  const showEngine = !singleLeague || singleLeague === 'engine';
  const showRun = !singleLeague || singleLeague === 'run';
  const allowDecimals = valueSuffix === ' ppm';

  const yAxis = useMemo(() => {
    const maxValue = chartMaxValue(data, stack.engineKey, stack.runKey, singleLeague);
    return buildYAxisScale(maxValue, allowDecimals);
  }, [allowDecimals, data, singleLeague, stack.engineKey, stack.runKey]);

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
          data={data}
          margin={{ top: 6, right: 4, left: 0, bottom: showAllTicks ? 4 : 0 }}
        >
          <defs>
            <linearGradient id={engineFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ENGINE_CHART_COLOR} stopOpacity={AREA_PEAK_OPACITY} />
              <stop offset="100%" stopColor={ENGINE_CHART_COLOR} stopOpacity={AREA_FLOOR_OPACITY} />
            </linearGradient>
            <linearGradient id={runFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RUN_CHART_COLOR} stopOpacity={AREA_PEAK_OPACITY} />
              <stop offset="100%" stopColor={RUN_CHART_COLOR} stopOpacity={AREA_FLOOR_OPACITY} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_STROKE} />
          <XAxis
            dataKey="dayLabel"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval={showAllTicks ? 0 : 'preserveStartEnd'}
            minTickGap={showAllTicks ? 0 : 12}
          />
          <YAxis
            tick={CHART_AXIS_TICK}
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
              cursor={{ stroke: CHART_CURSOR_STROKE, strokeWidth: 1 }}
            />
          ) : null}
          {showEngine ? (
            <Area
              type="monotone"
              dataKey={stack.engineKey}
              name="Engine"
              stroke={ENGINE_CHART_COLOR}
              strokeWidth={CHART_STROKE_WIDTH}
              fill={`url(#${engineFillId})`}
              fillOpacity={1}
              dot={false}
              activeDot={
                showTooltip
                  ? { r: 4, fill: ENGINE_CHART_COLOR, stroke: CHART_ACTIVE_DOT_STROKE, strokeWidth: 2 }
                  : false
              }
              isAnimationActive={false}
            />
          ) : null}
          {showRun ? (
            <Area
              type="monotone"
              dataKey={stack.runKey}
              name="Run"
              stroke={RUN_CHART_COLOR}
              strokeWidth={CHART_STROKE_WIDTH}
              fill={`url(#${runFillId})`}
              fillOpacity={1}
              dot={false}
              activeDot={
                showTooltip
                  ? { r: 4, fill: RUN_CHART_COLOR, stroke: CHART_ACTIVE_DOT_STROKE, strokeWidth: 2 }
                  : false
              }
              isAnimationActive={false}
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
  const fillId = useId().replace(/:/g, '');

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={AREA_PEAK_OPACITY} />
              <stop offset="100%" stopColor={color} stopOpacity={AREA_FLOOR_OPACITY} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_STROKE} />
          <XAxis
            dataKey="dayLabel"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={CHART_AXIS_TICK}
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
            cursor={{ stroke: CHART_CURSOR_STROKE, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={CHART_STROKE_WIDTH}
            fill={`url(#${fillId})`}
            fillOpacity={1}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: CHART_ACTIVE_DOT_STROKE, strokeWidth: 2 }}
            isAnimationActive={false}
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
  const gradientPrefix = useId().replace(/:/g, '');
  const engineFillId = `${gradientPrefix}-engine`;
  const runFillId = `${gradientPrefix}-run`;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={engineFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ENGINE_CHART_COLOR} stopOpacity={AREA_PEAK_OPACITY} />
              <stop offset="100%" stopColor={ENGINE_CHART_COLOR} stopOpacity={AREA_FLOOR_OPACITY} />
            </linearGradient>
            <linearGradient id={runFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RUN_CHART_COLOR} stopOpacity={AREA_PEAK_OPACITY} />
              <stop offset="100%" stopColor={RUN_CHART_COLOR} stopOpacity={AREA_FLOOR_OPACITY} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_STROKE} />
          <XAxis
            dataKey="dayLabel"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={36}
            tickCount={4}
            domain={[0, 'auto']}
          />
          <Tooltip
            content={<ChartTooltip valueSuffix={valueSuffix} />}
            cursor={{ stroke: CHART_CURSOR_STROKE, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey={engineKey}
            name="Engine"
            stroke={ENGINE_CHART_COLOR}
            strokeWidth={CHART_STROKE_WIDTH}
            fill={`url(#${engineFillId})`}
            fillOpacity={1}
            dot={false}
            activeDot={{
              r: 4,
              fill: ENGINE_CHART_COLOR,
              stroke: CHART_ACTIVE_DOT_STROKE,
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey={runKey}
            name="Run"
            stroke={RUN_CHART_COLOR}
            strokeWidth={CHART_STROKE_WIDTH}
            fill={`url(#${runFillId})`}
            fillOpacity={1}
            dot={false}
            activeDot={{
              r: 4,
              fill: RUN_CHART_COLOR,
              stroke: CHART_ACTIVE_DOT_STROKE,
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
