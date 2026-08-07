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
import { formatScore } from '@/lib/formatScore';
import { cn } from '@/lib/utils';

export { ENGINE_CHART_COLOR, RUN_CHART_COLOR };

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

/** Axis tick labels — ppm keeps decimals; never route ppm through formatScore (ceil → ints). */
export function formatMomentumAxisTick(value: number, unit: MomentumChartUnit): string {
  if (!Number.isFinite(value)) return '';
  if (unit === 'ppm') {
    const rounded = Math.round(value * 100) / 100;
    if (Object.is(rounded, -0) || rounded === 0) return '0';
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
      const n = Number(row[key]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

/** Evenly spaced monotonic ticks from 0 → padded nice ceiling. */
export function buildMomentumYAxisScale(
  maxValue: number,
  unit: MomentumChartUnit,
): MomentumYAxis {
  const allowDecimals = unitUsesDecimals(unit);
  const fallback = unit === 'ppm' ? 3 : unit === 'min' ? 60 : 100;
  const intervals = Y_AXIS_TICK_COUNT - 1;

  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    const step = fallback / intervals;
    const ticks = Array.from({ length: Y_AXIS_TICK_COUNT }, (_, i) => {
      const value = i * step;
      return allowDecimals ? Math.round(value * 100) / 100 : Math.round(value);
    });
    return { domain: [0, ticks[ticks.length - 1]!], ticks };
  }

  // Efficiency is points÷minutes (low single digits). Avoid oversized ceilings
  // from aggressive nice-steps (e.g. 7.2 → step 5 → domain 15).
  const pad = unit === 'ppm' ? 1.15 : 1.12;
  let step = niceStep((maxValue * pad) / intervals);
  let niceMax = step * intervals;
  if (unit === 'ppm' && niceMax > maxValue * 1.5) {
    const finer =
      step === 5 ? 2.5 : step === 2.5 ? 2 : step === 2 ? 1 : step === 1 ? 0.5 : step / 2;
    if (finer * intervals >= maxValue) {
      step = finer;
      niceMax = step * intervals;
    }
  }

  const ticks = Array.from({ length: Y_AXIS_TICK_COUNT }, (_, i) => {
    const value = i * step;
    if (!allowDecimals) return Math.round(value);
    return Math.round(value * 100) / 100;
  });

  // Guarantee strictly increasing ticks (guards float edge cases).
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i]! <= ticks[i - 1]!) {
      ticks[i] = allowDecimals
        ? Math.round((ticks[i - 1]! + step) * 100) / 100
        : ticks[i - 1]! + Math.max(1, Math.round(step));
    }
  }

  return { domain: [0, ticks[ticks.length - 1]!], ticks };
}

/** Explicit Y-axis for a tab — never rely on Recharts auto domain. */
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
 * Spike series for the shared 7-day axis: every day is present.
 * Session days keep their value; empty days sit at 0 so monotone areas
 * form valleys (no null gaps / floating segments).
 */
export function prepareMomentumSpikeData(data: ChartRow[], series: MomentumSeries[]): ChartRow[] {
  const keys = series.map((s) => s.key);
  return data.map((row) => {
    const point: ChartRow = {
      date: row.date ?? null,
      dayLabel: row.dayLabel ?? '',
    };
    for (const key of keys) {
      const raw = Number(row[key]);
      point[key] = Number.isFinite(raw) && raw > 0 ? raw : 0;
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
    <div className={CHART_TOOLTIP_CLASS}>
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
    <div
      className={cn('w-full', className)}
      style={{ height, isolation: 'isolate' }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={spikeData} margin={{ top: 8, right: 6, left: 0, bottom: 4 }}>
          <defs>
            {series.map((s) => {
              const fillId = `${gradientPrefix}-${s.key}`;
              return (
                <linearGradient key={fillId} id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={AREA_PEAK_OPACITY} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={AREA_FLOOR_OPACITY} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_GRID_STROKE} />
          <XAxis
            dataKey="dayLabel"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval={0}
            minTickGap={0}
          />
          <YAxis
            type="number"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            interval={0}
            allowDecimals={unitUsesDecimals(unit)}
            allowDataOverflow
            tickMargin={2}
            tickFormatter={(value) => formatMomentumAxisTick(Number(value), unit)}
          />
          {showTooltip ? (
            <Tooltip
              content={<ChartTooltip unit={unit} series={series} />}
              cursor={{ stroke: CHART_CURSOR_STROKE, strokeWidth: 1 }}
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
                strokeWidth={CHART_STROKE_WIDTH}
                fill={`url(#${fillId})`}
                fillOpacity={1}
                dot={false}
                activeDot={
                  showTooltip
                    ? { r: 4, fill: s.color, stroke: CHART_ACTIVE_DOT_STROKE, strokeWidth: 2 }
                    : false
                }
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
