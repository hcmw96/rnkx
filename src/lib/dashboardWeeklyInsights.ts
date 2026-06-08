import { addDays, format, parseISO, startOfDay, subDays } from 'date-fns';
import { activitySessionScore } from '@/lib/activitySessionScore';

export type DailyWeekAggregate = {
  date: string;
  dayLabel: string;
  engine_minutes: number;
  run_minutes: number;
  engine_points: number;
  run_points: number;
  engine_efficiency: number;
  run_efficiency: number;
};

export type WeeklyPeriodTotals = {
  engine_minutes: number;
  run_minutes: number;
  total_minutes: number;
  engine_points: number;
  run_points: number;
  total_points: number;
  avg_efficiency: number;
};

export type WeeklyInsightsData = {
  days: DailyWeekAggregate[];
  prevDays: DailyWeekAggregate[];
  totals: WeeklyPeriodTotals;
  prevTotals: WeeklyPeriodTotals;
};

export type InsightActivityRow = {
  activity_date: string;
  league_type: string;
  duration_minutes: number | null;
  avg_hr_percent: number | null;
  avg_pace_seconds: number | null;
};

export type InsightWorkoutRow = {
  started_at: string;
  duration_min: number | string;
  engine_score: number | string;
  run_score: number | string;
};

function emptyDay(date: Date): DailyWeekAggregate {
  return {
    date: format(date, 'yyyy-MM-dd'),
    dayLabel: format(date, 'EEE d'),
    engine_minutes: 0,
    run_minutes: 0,
    engine_points: 0,
    run_points: 0,
    engine_efficiency: 0,
    run_efficiency: 0,
  };
}

function workoutDateKey(startedAt: string): string {
  const started = new Date(startedAt);
  if (Number.isFinite(started.getTime())) {
    return started.toISOString().slice(0, 10);
  }
  return String(startedAt).slice(0, 10);
}

function addActivityToDay(day: DailyWeekAggregate, row: InsightActivityRow): void {
  const league = row.league_type === 'run' ? 'run' : 'engine';
  const duration = Math.max(0, Number(row.duration_minutes ?? 0));
  const score = activitySessionScore(
    league,
    duration,
    row.avg_hr_percent != null ? Number(row.avg_hr_percent) : null,
    row.avg_pace_seconds != null ? Number(row.avg_pace_seconds) : null,
  );

  if (league === 'engine') {
    day.engine_minutes += duration;
    day.engine_points += score;
  } else {
    day.run_minutes += duration;
    day.run_points += score;
  }
}

function addWorkoutToDay(day: DailyWeekAggregate, row: InsightWorkoutRow): void {
  const duration = Math.max(0, Number(row.duration_min) || 0);
  const enginePts = Number(row.engine_score) || 0;
  const runPts = Number(row.run_score) || 0;

  if (enginePts > 0) {
    day.engine_minutes += duration;
    day.engine_points += enginePts;
  }
  if (runPts > 0) {
    day.run_minutes += duration;
    day.run_points += runPts;
  }
}

function finalizeDayEfficiency(day: DailyWeekAggregate): DailyWeekAggregate {
  return {
    ...day,
    engine_efficiency: day.engine_minutes > 0 ? day.engine_points / day.engine_minutes : 0,
    run_efficiency: day.run_minutes > 0 ? day.run_points / day.run_minutes : 0,
  };
}

function sumPeriod(days: DailyWeekAggregate[]): WeeklyPeriodTotals {
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

function buildDayMap(
  activities: InsightActivityRow[],
  workouts: InsightWorkoutRow[],
  rangeStart: Date,
  dayCount: number,
): Map<string, DailyWeekAggregate> {
  const map = new Map<string, DailyWeekAggregate>();
  for (let i = 0; i < dayCount; i++) {
    const date = addDays(rangeStart, i);
    const key = format(date, 'yyyy-MM-dd');
    map.set(key, emptyDay(date));
  }

  const startKey = format(rangeStart, 'yyyy-MM-dd');
  const endDate = addDays(rangeStart, dayCount - 1);
  const endKey = format(endDate, 'yyyy-MM-dd');

  for (const row of activities) {
    const key = row.activity_date.slice(0, 10);
    if (key < startKey || key > endKey) continue;
    const day = map.get(key);
    if (day) addActivityToDay(day, row);
  }

  for (const row of workouts) {
    const key = workoutDateKey(row.started_at);
    if (key < startKey || key > endKey) continue;
    const day = map.get(key);
    if (day) addWorkoutToDay(day, row);
  }

  return map;
}

export function buildWeeklyInsights(
  activities: InsightActivityRow[],
  workouts: InsightWorkoutRow[],
  referenceDate: Date = new Date(),
  dayCount = 14,
): WeeklyInsightsData {
  const today = startOfDay(referenceDate);
  const currentWeekStart = subDays(today, dayCount - 1);
  const prevWeekStart = subDays(currentWeekStart, dayCount);

  const currentMap = buildDayMap(activities, workouts, currentWeekStart, dayCount);
  const prevMap = buildDayMap(activities, workouts, prevWeekStart, dayCount);

  const days = Array.from(currentMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, day]) => finalizeDayEfficiency(day));
  const prevDays = Array.from(prevMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, day]) => finalizeDayEfficiency(day));

  return {
    days,
    prevDays,
    totals: sumPeriod(days),
    prevTotals: sumPeriod(prevDays),
  };
}

export function insightsFetchSinceIso(dayCount: number, referenceDate: Date = new Date()): string {
  const since = subDays(startOfDay(referenceDate), dayCount - 1);
  return format(since, 'yyyy-MM-dd');
}

export function weekDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

/** ISO timestamp for workouts query (14 days back). */
export function workoutsFetchSinceIso(dayCount: number, referenceDate: Date = new Date()): string {
  const since = subDays(startOfDay(referenceDate), dayCount - 1);
  return since.toISOString();
}

export function formatInsightDateLabel(dateIso: string): string {
  try {
    return format(parseISO(`${dateIso}T12:00:00`), 'EEE d MMM');
  } catch {
    return dateIso;
  }
}
