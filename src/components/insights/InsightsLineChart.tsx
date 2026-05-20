import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';

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
    <div className="rounded-lg border border-border/80 bg-[hsla(0,0%,8%,0.95)] px-3 py-2 shadow-xl backdrop-blur-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-semibold text-foreground tabular-nums">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
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
  variant = 'area',
  height = 200,
  valueSuffix = '',
  className,
  yDomain,
}: InsightsLineChartProps) {
  const Chart = variant === 'area' ? AreaChart : LineChart;

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <defs>
            {series.map((s) =>
              s.fillId ? (
                <linearGradient key={s.fillId} id={s.fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ) : null,
            )}
          </defs>
          <CartesianGrid stroke="hsla(0,0%,18%,1)" strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'hsla(0,0%,55%,1)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={yDomain ?? [0, 'auto']}
            tick={{ fill: 'hsla(0,0%,45%,1)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<ChartTooltip valueSuffix={valueSuffix} />} cursor={{ stroke: 'hsla(0,0%,30%,0.8)' }} />
          {series.map((s) =>
            variant === 'area' ? (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.5}
                fill={s.fillId ? `url(#${s.fillId})` : s.color}
                dot={false}
                activeDot={{ r: 4, fill: s.color, stroke: '#0a0a0a', strokeWidth: 2 }}
              />
            ) : (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: s.color, stroke: '#0a0a0a', strokeWidth: 2 }}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
