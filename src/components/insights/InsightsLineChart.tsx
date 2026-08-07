import { useId } from 'react';
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
} from '@/lib/chartTheme';
import { cn } from '@/lib/utils';
import { formatScore } from '@/lib/formatScore';

type ChartPoint = Record<string, string | number | null>;

type SeriesConfig = {
  dataKey: string;
  label: string;
  color: string;
  fillId?: string;
};

type InsightsLineChartProps = {
  data: ChartPoint[];
  series: SeriesConfig[];
  /** Kept for call-site compatibility — always renders the SCORE gradient area style. */
  variant?: 'line' | 'area';
  height?: number;
  valueSuffix?: string;
  className?: string;
  yDomain?: [number, number | 'auto'];
};

function ChartTooltip({
  active,
  payload,
  label,
  valueSuffix = '',
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  valueSuffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className={CHART_TOOLTIP_CLASS}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-semibold text-foreground tabular-nums">
              {typeof entry.value === 'number' ? formatScore(entry.value) : entry.value}
              {valueSuffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InsightsLineChart({
  data,
  series,
  height = 200,
  valueSuffix = '',
  className,
  yDomain,
}: InsightsLineChartProps) {
  const gradientPrefix = useId().replace(/:/g, '');

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <defs>
            {series.map((s) => {
              const fillId = s.fillId ?? `${gradientPrefix}-${s.dataKey}`;
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
            dataKey="label"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            domain={yDomain ?? [0, 'auto']}
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={32}
            tickCount={4}
          />
          <Tooltip
            content={<ChartTooltip valueSuffix={valueSuffix} />}
            cursor={{ stroke: CHART_CURSOR_STROKE, strokeWidth: 1 }}
          />
          {series.map((s) => {
            const fillId = s.fillId ?? `${gradientPrefix}-${s.dataKey}`;
            return (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.label}
                stroke={s.color}
                strokeWidth={CHART_STROKE_WIDTH}
                fill={`url(#${fillId})`}
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 4, fill: s.color, stroke: CHART_ACTIVE_DOT_STROKE, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
