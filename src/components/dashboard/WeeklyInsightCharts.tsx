import { useId, useMemo, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
const ENGINE_CHART_COLOR_SOFT = 'hsl(72 100% 50% / 0.88)';
const RUN_CHART_COLOR_SOFT = 'hsl(187 85% 53% / 0.88)';
const AXIS_MUTED = 'hsl(0 0% 55%)';
const GRID_STROKE = 'hsla(0,0%,100%,0.05)';

type StackKeys = {
  engineKey: string;
  runKey: string;
};

type WeeklyStackedBarChartProps = {
  data: Record<string, string | number | boolean | null | undefined>[];
  stack: StackKeys;
  height?: number;
  valueSuffix?: string;
  formatValue?: (value: number) => string;
  className?: string;
  showTooltip?: boolean;
  singleLeague?: 'engine' | 'run';
};

type WeeklyStackedAreaChartProps = WeeklyStackedBarChartProps;

const Y_AXIS_TICK_COUNT = 4;
const BAR_RADIUS = 5;

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const fraction = rawStep / magnitude;
  const niceFraction =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

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
  const step = niceStep((maxValue * 1.12) / intervals);
  const niceMax = step * intervals;
  const ticks = Array.from({ length: Y_AXIS_TICK_COUNT }, (_, i) => {
    const value = i * step;
    if (!allowDecimals) return Math.round(value);
    return Math.round(value * 10) / 10;
  });
  return { domain: [0, niceMax], ticks };
}

function chartMaxValue(
  data: Record<string, string | number | boolean | null | undefined>[],
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

type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Record<string, unknown>;
  dataKey?: string | number;
};

function makeStackedBarShape(engineKey: string, runKey: string) {
  return function StackedBarShape(props: BarShapeProps) {
    const { x = 0, y = 0, width = 0, height = 0, fill, payload, dataKey } = props;
    if (height <= 0 || width <= 0) return null;

    const engine = Number(payload?.[engineKey]) || 0;
    const run = Number(payload?.[runKey]) || 0;
    const isTopSegment =
      dataKey === runKey ? run > 0 : dataKey === engineKey && engine > 0 && run <= 0;
    const radius = Math.min(BAR_RADIUS, width / 2, height / 2);

    if (!isTopSegment) {
      return <rect x={x} y={y} width={width} height={height} fill={fill} />;
    }

    return (
      <path
        d={`M ${x} ${y + radius} Q ${x} ${y} ${x + radius} ${y} L ${x + width - radius} ${y} Q ${x + width} ${y} ${x + width} ${y + radius} L ${x + width} ${y + height} L ${x} ${y + height} Z`}
        fill={fill}
      />
    );
  };
}

function renderDayAxisTick(
  data: Record<string, string | number | boolean | null | undefined>[],
) {
  return function DayAxisTick(props: Record<string, unknown>) {
    const x = Number(props.x) || 0;
    const y = Number(props.y) || 0;
    const index = Number(props.index) || 0;
    const payload = props.payload as { value?: string | number } | undefined;
    const row = data[index];
    const isToday = Boolean(row?.isToday);
    const label = payload?.value ?? '';

    return (
      <text
        x={x}
        y={y + 12}
        textAnchor="middle"
        fill={isToday ? ENGINE_CHART_COLOR : AXIS_MUTED}
        fontSize={10}
        fontWeight={isToday ? 600 : 400}
      >
        {label}
      </text>
    );
  };
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

  const total = visible.reduce((sum, entry) => sum + Number(entry.value), 0);

  return (
    <div className="rounded-xl border border-border/70 bg-[hsla(0,0%,6%,0.96)] px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums text-foreground">
        {fmt(total)}
        {valueSuffix}
      </p>
      <ul className="mt-2 space-y-1 border-t border-border/50 pt-2">
        {visible.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full shadow-[0_0_6px_currentColor]"
              style={{ backgroundColor: entry.color, color: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-semibold text-foreground tabular-nums">
              {fmt(entry.value)}
              {valueSuffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChartSurface({
  children,
  className,
  height,
}: {
  children: ReactNode;
  className?: string;
  height: number;
}) {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-lg bg-gradient-to-b from-white/[0.035] to-transparent',
        className,
      )}
      style={{ height }}
    >
      <div
        className="pointer-events-none absolute inset-x-3 bottom-6 top-8 rounded-md border border-white/[0.04] bg-white/[0.015]"
        aria-hidden
      />
      {children}
    </div>
  );
}

export function WeeklyStackedBarChart({
  data,
  stack,
  height = 120,
  valueSuffix = '',
  formatValue,
  className,
  showTooltip = true,
  singleLeague,
}: WeeklyStackedBarChartProps) {
  const engineFillId = useId();
  const runFillId = useId();
  const showAllTicks = data.length <= 7;
  const showEngine = !singleLeague || singleLeague === 'engine';
  const showRun = !singleLeague || singleLeague === 'run';
  const allowDecimals = valueSuffix === ' ppm';
  const stackId = singleLeague ? undefined : 'week';
  const engineShape = useMemo(
    () => makeStackedBarShape(stack.engineKey, stack.runKey),
    [stack.engineKey, stack.runKey],
  );
  const runShape = engineShape;

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

  const dayTick = useMemo(() => renderDayAxisTick(data), [data]);

  return (
    <ChartSurface className={className} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          barCategoryGap="22%"
          margin={{ top: 10, right: 6, left: 0, bottom: showAllTicks ? 2 : 0 }}
        >
          <defs>
            <linearGradient id={engineFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ENGINE_CHART_COLOR} stopOpacity={1} />
              <stop offset="100%" stopColor={ENGINE_CHART_COLOR} stopOpacity={0.72} />
            </linearGradient>
            <linearGradient id={runFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RUN_CHART_COLOR} stopOpacity={1} />
              <stop offset="100%" stopColor={RUN_CHART_COLOR} stopOpacity={0.72} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 8" vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="dayLabel"
            axisLine={false}
            tickLine={false}
            interval={showAllTicks ? 0 : 'preserveStartEnd'}
            minTickGap={showAllTicks ? 0 : 12}
            tick={dayTick}
          />
          <YAxis
            tick={{ fill: AXIS_MUTED, fontSize: 10 }}
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
              cursor={{ fill: 'hsla(0,0%,100%,0.04)', radius: 6 }}
            />
          ) : null}
          {showEngine ? (
            <Bar
              dataKey={stack.engineKey}
              name="Engine"
              stackId={stackId}
              fill={`url(#${engineFillId})`}
              shape={engineShape}
              animationDuration={650}
              animationEasing="ease-out"
              maxBarSize={28}
            />
          ) : null}
          {showRun ? (
            <Bar
              dataKey={stack.runKey}
              name="Run"
              stackId={stackId}
              fill={`url(#${runFillId})`}
              shape={runShape}
              animationDuration={650}
              animationEasing="ease-out"
              maxBarSize={28}
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </ChartSurface>
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
  const isStacked = stackId != null;
  const areaCurve = isStacked ? 'stepAfter' : 'monotone';

  const chartData = useMemo(() => {
    if (!isStacked) return data;
    return data.map((row) => {
      const next = { ...row };
      const engineVal = Number(row[stack.engineKey]);
      const runVal = Number(row[stack.runKey]);
      if (!Number.isFinite(engineVal) || engineVal <= 0) {
        next[stack.engineKey] = null as unknown as string | number;
      }
      if (!Number.isFinite(runVal) || runVal <= 0) {
        next[stack.runKey] = null as unknown as string | number;
      }
      return next;
    });
  }, [data, isStacked, stack.engineKey, stack.runKey]);

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

  const dayTick = useMemo(() => renderDayAxisTick(data), [data]);

  return (
    <ChartSurface className={className} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 6, left: 0, bottom: showAllTicks ? 2 : 0 }}
        >
          <defs>
            <linearGradient id={engineFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ENGINE_CHART_COLOR} stopOpacity={0.55} />
              <stop offset="100%" stopColor={ENGINE_CHART_COLOR} stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id={runFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RUN_CHART_COLOR} stopOpacity={0.55} />
              <stop offset="100%" stopColor={RUN_CHART_COLOR} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 8" vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="dayLabel"
            axisLine={false}
            tickLine={false}
            interval={showAllTicks ? 0 : 'preserveStartEnd'}
            minTickGap={showAllTicks ? 0 : 12}
            tick={dayTick}
          />
          <YAxis
            tick={{ fill: AXIS_MUTED, fontSize: 10 }}
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
              cursor={{ stroke: 'hsla(0,0%,100%,0.1)', strokeWidth: 1 }}
            />
          ) : null}
          {showEngine ? (
            <Area
              type={areaCurve}
              dataKey={stack.engineKey}
              name="Engine"
              stackId={stackId}
              stroke={ENGINE_CHART_COLOR_SOFT}
              strokeWidth={isStacked ? 1.5 : 2}
              fill={`url(#${engineFillId})`}
              connectNulls={!isStacked}
              dot={false}
              activeDot={
                isStacked
                  ? false
                  : { r: 4, fill: ENGINE_CHART_COLOR, stroke: '#0a0a0a', strokeWidth: 1.5 }
              }
            />
          ) : null}
          {showRun ? (
            <Area
              type={areaCurve}
              dataKey={stack.runKey}
              name="Run"
              stackId={stackId}
              stroke={isStacked ? 'none' : RUN_CHART_COLOR_SOFT}
              strokeWidth={isStacked ? 0 : 2}
              fill={`url(#${runFillId})`}
              connectNulls={!isStacked}
              dot={false}
              activeDot={
                isStacked
                  ? false
                  : { r: 4, fill: RUN_CHART_COLOR, stroke: '#0a0a0a', strokeWidth: 1.5 }
              }
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </ChartSurface>
  );
}

type WeeklyTrendLineChartProps = {
  data: Record<string, string | number | boolean | null | undefined>[];
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
    <ChartSurface height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 8" vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="dayLabel"
            tick={{ fill: AXIS_MUTED, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            tick={{ fill: AXIS_MUTED, fontSize: 10 }}
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
            cursor={{ stroke: 'hsla(0,0%,100%,0.1)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${fillId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: '#0a0a0a', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartSurface>
  );
}

export function WeeklyDualTrendLineChart({
  data,
  engineKey,
  runKey,
  height = 200,
  valueSuffix = '',
}: {
  data: Record<string, string | number | boolean | null | undefined>[];
  engineKey: string;
  runKey: string;
  height?: number;
  valueSuffix?: string;
}) {
  const engineFillId = useId();
  const runFillId = useId();
  const dayTick = useMemo(() => renderDayAxisTick(data), [data]);

  return (
    <ChartSurface height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id={engineFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ENGINE_CHART_COLOR} stopOpacity={0.45} />
              <stop offset="100%" stopColor={ENGINE_CHART_COLOR} stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id={runFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RUN_CHART_COLOR} stopOpacity={0.45} />
              <stop offset="100%" stopColor={RUN_CHART_COLOR} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 8" vertical={false} stroke={GRID_STROKE} />
          <XAxis
            dataKey="dayLabel"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
            tick={dayTick}
          />
          <YAxis
            tick={{ fill: AXIS_MUTED, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickCount={4}
            domain={[0, 'auto']}
          />
          <Tooltip
            content={<ChartTooltip valueSuffix={valueSuffix} />}
            cursor={{ stroke: 'hsla(0,0%,100%,0.1)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey={engineKey}
            name="Engine"
            stroke={ENGINE_CHART_COLOR_SOFT}
            strokeWidth={2.5}
            fill={`url(#${engineFillId})`}
            dot={false}
            activeDot={{ r: 4, fill: ENGINE_CHART_COLOR, stroke: '#0a0a0a', strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey={runKey}
            name="Run"
            stroke={RUN_CHART_COLOR_SOFT}
            strokeWidth={2.5}
            fill={`url(#${runFillId})`}
            dot={false}
            activeDot={{ r: 4, fill: RUN_CHART_COLOR, stroke: '#0a0a0a', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartSurface>
  );
}
