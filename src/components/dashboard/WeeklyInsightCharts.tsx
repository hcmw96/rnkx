import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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

type WeeklyStackedBarChartProps = {
  data: Record<string, string | number>[];
  stack: StackKeys;
  height?: number;
  valueSuffix?: string;
  formatValue?: (value: number) => string;
  className?: string;
  /** Hover tooltip on chart bars (off for dashboard preview card). */
  showTooltip?: boolean;
  /** Show only one league's bars (Engine/Run toggle on dashboard preview). */
  singleLeague?: 'engine' | 'run';
  /** Short unit label for Y-axis ticks (pts, min, ppm). */
  yAxisUnit?: string;
};

function formatYAxisTick(value: number, unit: string, allowDecimals: boolean): string {
  if (!Number.isFinite(value)) return '';
  const n = allowDecimals ? formatScore(value) : String(Math.round(value));
  return unit ? `${n} ${unit}` : n;
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

  return (
    <div className="rounded-lg border border-border/80 bg-[hsla(0,0%,8%,0.95)] px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry) => (
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

export function WeeklyStackedBarChart({
  data,
  stack,
  height = 120,
  valueSuffix = '',
  formatValue,
  className,
  showTooltip = true,
  singleLeague,
  yAxisUnit = '',
}: WeeklyStackedBarChartProps) {
  const showAllTicks = data.length <= 7;
  const showEngine = !singleLeague || singleLeague === 'engine';
  const showRun = !singleLeague || singleLeague === 'run';
  const allowDecimals = valueSuffix === ' ppm';
  const yAxisWidth = yAxisUnit === 'ppm' ? 52 : yAxisUnit === 'min' ? 44 : 48;

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: showAllTicks ? 4 : 0 }}
          barCategoryGap="20%"
        >
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
            tickCount={4}
            domain={[0, 'auto']}
            tickFormatter={(value) => formatYAxisTick(Number(value), yAxisUnit, allowDecimals)}
          />
          {showTooltip ? (
            <Tooltip
              content={<ChartTooltip valueSuffix={valueSuffix} formatValue={formatValue} />}
              cursor={{ fill: 'hsla(0,0%,100%,0.04)' }}
            />
          ) : null}
          {showEngine ? (
            <Bar
              dataKey={stack.engineKey}
              name="Engine"
              stackId={singleLeague ? undefined : 'week'}
              fill={ENGINE_CHART_COLOR}
              radius={showRun && !singleLeague ? [0, 0, 0, 0] : [4, 4, 0, 0]}
              maxBarSize={28}
            />
          ) : null}
          {showRun ? (
            <Bar
              dataKey={stack.runKey}
              name="Run"
              stackId={singleLeague ? undefined : 'week'}
              fill={RUN_CHART_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

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
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
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
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
          <Tooltip content={<ChartTooltip valueSuffix={valueSuffix} />} />
          <Line
            type="monotone"
            dataKey={engineKey}
            name="Engine"
            stroke={ENGINE_CHART_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: ENGINE_CHART_COLOR }}
          />
          <Line
            type="monotone"
            dataKey={runKey}
            name="Run"
            stroke={RUN_CHART_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: RUN_CHART_COLOR }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
