import type { DailyWeekAggregate, WeeklyInsightsData } from '@/lib/dashboardWeeklyInsights';
import type { InsightsSummary } from '@/lib/insightsAggregates';

const PREVIEW_DAYS: DailyWeekAggregate[] = [
  { date: '2026-06-06', dayLabel: 'Sat 6', engine_points: 0, run_points: 130, engine_minutes: 0, run_minutes: 28, engine_efficiency: 0, run_efficiency: 4.6 },
  { date: '2026-06-07', dayLabel: 'Sun 7', engine_points: 210, run_points: 0, engine_minutes: 45, run_minutes: 0, engine_efficiency: 4.7, run_efficiency: 0 },
  { date: '2026-06-08', dayLabel: 'Mon 8', engine_points: 120, run_points: 130, engine_minutes: 30, run_minutes: 28, engine_efficiency: 4.0, run_efficiency: 4.6 },
  { date: '2026-06-09', dayLabel: 'Tue 9', engine_points: 360, run_points: 0, engine_minutes: 50, run_minutes: 0, engine_efficiency: 7.2, run_efficiency: 0 },
  { date: '2026-06-10', dayLabel: 'Wed 10', engine_points: 0, run_points: 150, engine_minutes: 0, run_minutes: 32, engine_efficiency: 0, run_efficiency: 4.7 },
  { date: '2026-06-11', dayLabel: 'Thu 11', engine_points: 340, run_points: 0, engine_minutes: 48, run_minutes: 0, engine_efficiency: 7.1, run_efficiency: 0 },
  { date: '2026-06-12', dayLabel: 'Fri 12', engine_points: 0, run_points: 0, engine_minutes: 0, run_minutes: 0, engine_efficiency: 0, run_efficiency: 0 },
];

function sumPeriod(days: DailyWeekAggregate[]) {
  const engine_minutes = days.reduce((s, d) => s + d.engine_minutes, 0);
  const run_minutes = days.reduce((s, d) => s + d.run_minutes, 0);
  const engine_points = days.reduce((s, d) => s + d.engine_points, 0);
  const run_points = days.reduce((s, d) => s + d.run_points, 0);
  const total_minutes = engine_minutes + run_minutes;
  const total_points = engine_points + run_points;

  return {
    engine_minutes,
    run_minutes,
    total_minutes,
    engine_points,
    run_points,
    total_points,
    avg_efficiency: total_minutes > 0 ? total_points / total_minutes : 0,
  };
}

const PREVIEW_PREV_DAYS: DailyWeekAggregate[] = PREVIEW_DAYS.map((d) => ({
  ...d,
  engine_points: Math.round(d.engine_points * 0.85),
  run_points: Math.round(d.run_points * 0.85),
}));

export const PREVIEW_WEEKLY_INSIGHTS: WeeklyInsightsData = {
  days: PREVIEW_DAYS,
  prevDays: PREVIEW_PREV_DAYS,
  totals: sumPeriod(PREVIEW_DAYS),
  prevTotals: sumPeriod(PREVIEW_PREV_DAYS),
};

export const PREVIEW_COACH_SUMMARY: InsightsSummary = {
  daily: [],
  cumulative: [],
  topSessions: [],
  weekPts: 1030,
  prevWeekPts: 875,
  weekDelta: 155,
  weekSessions: 6,
  avgIntensity: 82,
  bestSession: null,
  insightLines: [
    'Your best sessions land mid-week — consistency is building.',
    'Engine intensity averaged 82% this week — strong training load.',
  ],
};
