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
import { formatScore } from '@/lib/formatScore';
import { cn } from '@/lib/utils';

/** RNKX Engine green — matches `--neon-lime` / `text-neon-lime`. */
export const ENGINE_CHART_COLOR = 'hsl(72 100% 50%)';
/** RNKX Run cyan — matches `--secondary` / `text-secondary`. */
export const RUN_CHART_COLOR = 'hsl(186 100% 50%)';

const AREA_PEAK_OPACITY = 0.45;

export type MomentumSeries = {
  key: string;
  name: string;
  color: string;
};

export type MomentumChartUnit = 'pts' | 'min' | 'ppm';

export type MomentumYAxis = {
  domain: [number, number];
  ticks: number[];
};

type ChartRow = Record<string, string | number | null>;

type MomentumChartProps = {
  data: ChartRow[];
  series: MomentumSeries[];
  unit: MomentumChartUnit;
  yAxis: MomentumYAxis;
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
): MomentumYAxis {
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

/** Explicit Y-axis config for a tab — never rely on recharts auto domain. */
export function resolveMomentumYAxis(
  data: ChartRow[],
  series: MomentumSeries[],
  unit: MomentumChartUnit,
): MomentumYAxis {
  const maxValue = chartMaxForSeries(
    data,
    series.map((s) => s.key),
  );
  return buildMomentumYAxisScale(maxValue, unit);
}

/**
 * Spike area data: every day is present. Session days keep their value; non-session
 * days sit at 0 so monotone interpolation forms smooth valleys between peaks.
 */
export function prepareMomentumSpikeData(data: ChartRow[], series: MomentumSeries[]): ChartRow[] {
  const keys = series.map((s) => s.key);
  return data.map((row) => {
    const point: ChartRow = { ...row };
    for (const key of keys) {
      const v = Number(row[key]) || 0;
      point[key] = v > 0 ? v : 0;
    }
    return point;
  });
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  series,
}: {
  active?: boolean;
  payload?: { payload?: ChartRow }[];
  label?: string;
  unit: MomentumChartUnit;
  series: MomentumSeries[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const visible = series
    .map((s) => ({ ...s, value: Number(row[s.key]) || 0 }))
    .filter((s) => s.value > 0);
  if (!visible.length) return null;

  const suffix = unit === 'pts' ? ' pts' : unit === 'min' ? ' min' : ' ppm';

  return (
    <div className="rounded-lg border border-border/80 bg-[hsla(0,0%,8%,0.95)] px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {visible.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
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
  yAxis,
  height = 140,
  showTooltip = true,
  className,
}: MomentumChartProps) {
  const gradientPrefix = useId().replace(/:/g, '');

  const spikeData = useMemo(() => prepareMomentumSpikeData(data, series), [data, series]);

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
        <AreaChart
          data={spikeData}
          margin={{ top: 8, right: 6, left: 0, bottom: 4 }}
        >
          <defs>
            {series.map((s) => {
              const fillId = `${gradientPrefix}-${s.key}`;
              return (
                <linearGradient key={fillId} id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={AREA_PEAK_OPACITY} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
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
              content={<ChartTooltip unit={unit} series={series} />}
              cursor={{ stroke: 'hsla(0,0%,100%,0.12)', strokeWidth: 1 }}
            />
          ) : null}
          {series.map((s) => {
            const fillId = `${gradientPrefix}-${s.key}`;
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                baseValue={0}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#${fillId})`}
                fillOpacity={1}
                connectNulls
                isAnimationActive={false}
                legendType="none"
                style={{ mixBlendMode: 'screen' }}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
