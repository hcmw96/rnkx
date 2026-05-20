import {
  addDays,
  format,
  parseISO,
  startOfDay,
  subDays,
} from 'date-fns';
import { activitySessionScore } from '@/lib/activitySessionScore';

export type InsightActivity = {
  id: string;
  activity_type: string | null;
  league_type: string;
  activity_date: string;
  duration_minutes: number | null;
  avg_hr_percent: number | null;
  avg_pace_seconds: number | null;
};

export type DailyInsightPoint = {
  date: string;
  label: string;
  enginePts: number;
  runPts: number;
  totalPts: number;
  minutes: number;
  sessions: number;
  avgHrPercent: number | null;
};

export type SessionHighlight = {
  id: string;
  label: string;
  date: string;
  leagueType: 'engine' | 'run';
  score: number;
  duration: number;
};

export type InsightsSummary = {
  daily: DailyInsightPoint[];
  cumulative: { label: string; total: number }[];
  topSessions: SessionHighlight[];
  weekPts: number;
  prevWeekPts: number;
  weekDelta: number;
  weekSessions: number;
  avgIntensity: number | null;
  bestSession: SessionHighlight | null;
  insightLines: string[];
};

function leagueTypeOf(activity: InsightActivity): 'engine' | 'run' {
  return activity.league_type === 'run' ? 'run' : 'engine';
}

function activityLabel(activityType: string | null, leagueType: string): string {
  const value = String(activityType ?? '').toLowerCase();
  if (value.includes('run')) return 'Running';
  if (value.includes('strength')) return 'Strength';
  if (leagueType === 'run') return 'Running';
  return 'Engine';
}

function scoreActivity(activity: InsightActivity): { enginePts: number; runPts: number; total: number } {
  const leagueType = leagueTypeOf(activity);
  const duration = Math.max(0, Number(activity.duration_minutes ?? 0));
  const score = activitySessionScore(
    leagueType,
    duration,
    activity.avg_hr_percent != null ? Number(activity.avg_hr_percent) : null,
    activity.avg_pace_seconds != null ? Number(activity.avg_pace_seconds) : null,
  );
  return {
    enginePts: leagueType === 'engine' ? score : 0,
    runPts: leagueType === 'run' ? score : 0,
    total: score,
  };
}

/** Last N calendar days (oldest → newest), including today. */
export function buildInsightsSummary(
  activities: InsightActivity[],
  dayCount = 14,
): InsightsSummary {
  const today = startOfDay(new Date());
  const start = subDays(today, dayCount - 1);
  const dayKeys: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    dayKeys.push(format(addDays(start, i), 'yyyy-MM-dd'));
  }

  const byDay = new Map<string, DailyInsightPoint>();
  for (const key of dayKeys) {
    byDay.set(key, {
      date: key,
      label: format(parseISO(`${key}T12:00:00`), 'EEE'),
      enginePts: 0,
      runPts: 0,
      totalPts: 0,
      minutes: 0,
      sessions: 0,
      avgHrPercent: null,
    });
  }

  const hrSamples: { day: string; pct: number }[] = [];
  const highlights: SessionHighlight[] = [];

  for (const activity of activities) {
    const key = activity.activity_date?.slice(0, 10);
    if (!key || !byDay.has(key)) continue;

    const leagueType = leagueTypeOf(activity);
    const { enginePts, runPts, total } = scoreActivity(activity);
    const duration = Math.max(0, Number(activity.duration_minutes ?? 0));
    const bucket = byDay.get(key)!;
    bucket.enginePts += enginePts;
    bucket.runPts += runPts;
    bucket.totalPts += total;
    bucket.minutes += duration;
    bucket.sessions += 1;

    if (leagueType === 'engine' && activity.avg_hr_percent != null) {
      hrSamples.push({ day: key, pct: Number(activity.avg_hr_percent) });
    }

    highlights.push({
      id: activity.id,
      label: activityLabel(activity.activity_type, leagueType),
      date: key,
      leagueType,
      score: total,
      duration,
    });
  }

  const daily = dayKeys.map((k) => {
    const b = byDay.get(k)!;
    const dayHr = hrSamples.filter((h) => h.day === k);
    if (dayHr.length) {
      b.avgHrPercent = Math.round(dayHr.reduce((s, h) => s + h.pct, 0) / dayHr.length);
    }
    return b;
  });

  let running = 0;
  const cumulative = daily.map((d) => {
    running += d.totalPts;
    return { label: d.label, total: Math.round(running * 10) / 10 };
  });

  const topSessions = [...highlights].sort((a, b) => b.score - a.score).slice(0, 5);
  const bestSession = topSessions[0] ?? null;

  const last7Keys = dayKeys.slice(-7);
  const prev7Keys = dayKeys.slice(0, 7);
  const weekPts = last7Keys.reduce((s, k) => s + (byDay.get(k)?.totalPts ?? 0), 0);
  const prevWeekPts = prev7Keys.reduce((s, k) => s + (byDay.get(k)?.totalPts ?? 0), 0);
  const weekDelta = Math.round((weekPts - prevWeekPts) * 10) / 10;
  const weekSessions = last7Keys.reduce((s, k) => s + (byDay.get(k)?.sessions ?? 0), 0);

  const allHr = hrSamples.map((h) => h.pct);
  const avgIntensity = allHr.length
    ? Math.round(allHr.reduce((a, b) => a + b, 0) / allHr.length)
    : null;

  const insightLines: string[] = [];
  if (weekSessions === 0) {
    insightLines.push('Log a scored workout to unlock trend lines and session highlights.');
  } else {
    if (weekDelta > 0) {
      insightLines.push(
        `You earned ${weekPts.toLocaleString()} pts this week — up ${weekDelta.toLocaleString()} vs the prior week.`,
      );
    } else if (weekDelta < 0) {
      insightLines.push(
        `This week: ${weekPts.toLocaleString()} pts (${Math.abs(weekDelta).toLocaleString()} fewer than last week). A solid session can flip momentum.`,
      );
    } else {
      insightLines.push(`Steady week — ${weekPts.toLocaleString()} pts across ${weekSessions} session${weekSessions === 1 ? '' : 's'}.`);
    }
    if (bestSession) {
      insightLines.push(
        `Peak session: ${bestSession.label} on ${format(parseISO(`${bestSession.date}T12:00:00`), 'MMM d')} (${bestSession.score.toLocaleString()} pts).`,
      );
    }
    if (avgIntensity != null && avgIntensity >= 80) {
      insightLines.push(`Engine intensity averaged ${avgIntensity}% of max HR — high-quality training load.`);
    } else if (avgIntensity != null && avgIntensity < 60) {
      insightLines.push(`Avg engine intensity ${avgIntensity}% — add tempo or intervals to lift scoring bands.`);
    }
  }

  return {
    daily,
    cumulative,
    topSessions,
    weekPts,
    prevWeekPts,
    weekDelta,
    weekSessions,
    avgIntensity,
    bestSession,
    insightLines,
  };
}

/** Decorative curve for non-premium preview (deterministic). */
export const PREVIEW_TREND_POINTS = [
  { label: 'M', total: 12 },
  { label: 'T', total: 28 },
  { label: 'W', total: 22 },
  { label: 'T', total: 45 },
  { label: 'F', total: 38 },
  { label: 'S', total: 62 },
  { label: 'S', total: 78 },
] as const;
