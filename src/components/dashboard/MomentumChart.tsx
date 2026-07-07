import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatScore } from '@/lib/formatScore';
import { cn } from '@/lib/utils';

/** RNKX Engine green — matches `--neon-lime` / `text-neon-lime`. */
export const ENGINE_CHART_COLOR = 'hsl(72 100% 50%)';
/** RNKX Run cyan — matches `--secondary` / `text-secondary`. */
export const RUN_CHART_COLOR = 'hsl(186 100% 50%)';

export type MomentumSeries = {
  key: string;
  name: string;
  color: string;
};

export type MomentumChartUnit = 'pts' | 'min' | 'ppm';

type ChartRow = Record<string, string | number>;

type MomentumChartProps = {
  data: ChartRow[];
  series: MomentumSeries[];
  unit: MomentumChartUnit;
  /** Explicit Y domain; when omitted, derived from data + unit. */
  domain?: [number, number];
  height?: number;
  showTooltip?: boolean;
  className?: string;
};

const Y_AXIS_TICK_COUNT = 4;
const AXIS_TICK_STYLE = { fill: 'hsl(0 0% 55%)', fontSize: 10 };

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const fraction = rawStep / magnitude;
  const niceFraction =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

function unitUsesDecimals(unit: MomentumChartUnit): boolean {
  return unit === 'ppm';
}

/** Shared axis tick formatter — never use formatScore for ppm (it rounds to integers). */
export function formatMomentumAxisTick(value: number, unit: MomentumChartUnit): string {
  if (!Number.isFinite(value)) return '';
  if (unit === 'ppm') {
    const rounded = Math.round(value * 100) / 100;
    if (rounded === 0) return '0';
    if (Number.isInteger(rounded)) return String(rounded);
    return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }
  return String(Math.round(value));
}

export function formatMomentumValue(value: number, unit: MomentumChartUnit): string {
  if (!Number.isFinite(value)) return '0';
  if (unit === 'min') return String(Math.round(value));
  if (unit === 'ppm') return formatMomentumAxisTick(value, unit);
  return formatScore(value);
}

function chartMaxForSeries(data: ChartRow[], keys: string[]): number {
  let max = 0;
  for (const row of data) {
    for (const key of keys) {
      max = Math.max(max, Number(row[key]) || 0);
    }
  }
  return max;
}

/** Evenly spaced monotonic ticks from 0 with a padded ceiling aligned to the step. */
export function buildMomentumYAxisScale(
  maxValue: number,
  unit: MomentumChartUnit,
): { domain: [number, number]; ticks: number[] } {
  const allowDecimals = unitUsesDecimals(unit);
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    const fallback = unit === 'ppm' ? 3 : unit === 'min' ? 60 : 100;
    const intervals = Y_AXIS_TICK_COUNT - 1;
    const step = fallback / intervals;
    const ticks = Array.from({ length: Y_AXIS_TICK_COUNT }, (_, i) => {
      const value = i * step;
      return allowDecimals ? Math.round(value * 100) / 100 : Math.round(value);
    });
    return { domain: [0, fallback], ticks };
  }

  const intervals = Y_AXIS_TICK_COUNT - 1;
  const step = niceStep((maxValue * 1.12) / intervals);
  const niceMax = step * intervals;
  const ticks = Array.from({ length: Y_AXIS_TICK_COUNT }, (_, i) => {
    const value = i * step;
    if (!allowDecimals) return Math.round(value);
    return Math.round(value * 100) / 100;
  });
  return { domain: [0, niceMax], ticks };
}

function seriesHasPositiveData(data: ChartRow[], key: string): boolean {
  return data.some((row) => (Number(row[key]) || 0) > 0);
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string }[];
  label?: string;
  unit: MomentumChartUnit;
}) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((entry) => Number(entry.value) > 0);
  if (!visible.length) return null;

  const suffix = unit === 'pts' ? ' pts' : unit === 'min' ? ' min' : ' ppm';

  return (
    <div className="rounded-lg border border-border/80 bg-[hsla(0,0%,8%,0.95)] px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {visible.map((entry) => (
          <li key={entry.dataKey} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-semibold text-foreground tabular-nums">
              {formatMomentumValue(entry.value, unit)}
              {suffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MomentumChart({
  data,
  series,
  unit,
  domain: domainOverride,
  height = 140,
  showTooltip = true,
  className,
}: MomentumChartProps) {
  const activeSeries = useMemo(
    () => series.filter((s) => seriesHasPositiveData(data, s.key)),
    [data, series],
  );

  const yAxis = useMemo(() => {
    const dataMax = chartMaxForSeries(
      data,
      series.map((s) => s.key),
    );
    const scaleMax = domainOverride ? domainOverride[1] : dataMax;
    const scale = buildMomentumYAxisScale(scaleMax, unit);
    if (domainOverride) {
      return { domain: domainOverride, ticks: scale.ticks };
    }
    return scale;
  }, [data, domainOverride, series, unit]);

  const yAxisWidth = useMemo(() => {
    const widest = yAxis.ticks.reduce((max, tick) => {
      const label = formatMomentumAxisTick(tick, unit);
      return Math.max(max, label.length);
    }, 1);
    return Math.max(28, widest * 7 + 8);
  }, [unit, yAxis.ticks]);

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 6, right: 4, left: 0, bottom: 4 }}
          barCategoryGap="18%"
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(0,0%,100%,0.06)" />
          <XAxis
            dataKey="dayLabel"
            tick={AXIS_TICK_STYLE}
            axisLine={false}
            tickLine={false}
            interval={0}
            minTickGap={0}
          />
          <YAxis
            tick={AXIS_TICK_STYLE}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            allowDecimals={unitUsesDecimals(unit)}
            tickMargin={2}
            tickFormatter={(value) => formatMomentumAxisTick(Number(value), unit)}
          />
          {showTooltip ? (
            <Tooltip
              content={<ChartTooltip unit={unit} />}
              cursor={{ fill: 'hsla(0,0%,100%,0.04)' }}
            />
          ) : null}
          {activeSeries.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              stroke={s.color}
              strokeWidth={1}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
