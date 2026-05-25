import { activitySessionScore } from '@/lib/activitySessionScore';
import { fetchSeasonShareStats } from '@/lib/seasonShareStats';
import type { WorkoutObject } from '@/services/despia';
import { supabase } from '@/services/supabase';
import type { ProcessActivityRpcResult, WorkoutSharePayload } from '@/types/shareCards';

export function formatPaceDisplay(secondsPerKm: number): string {
  const sec = Math.round(secondsPerKm);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

function isRunActivityType(activityType: string | null | undefined, leagueType: 'engine' | 'run'): boolean {
  const t = (activityType ?? '').toLowerCase();
  return leagueType === 'run' || t.includes('run') || t.includes('walk') || t.includes('jog');
}

type WorkoutRow = {
  id: string;
  engine_score: number | string | null;
  run_score: number | string | null;
  duration_min: number | string | null;
  avg_hr: number | string | null;
  avg_pace_per_km: number | string | null;
  activity_type: string | null;
};

type ActivityRow = {
  id: string;
  league_type: string | null;
  activity_type: string | null;
  duration_minutes: number | string | null;
  avg_hr_percent: number | string | null;
  avg_pace_seconds: number | string | null;
};

async function basePayload(
  athleteId: string,
  opts: {
    leagueType: 'engine' | 'run';
    pointsScored: number;
    durationMin: number;
    avgHrPercent: number | null;
    avgPaceDisplay: string | null;
    activityType: string | null;
  },
): Promise<WorkoutSharePayload | null> {
  const season = await fetchSeasonShareStats(athleteId);
  if (!season || opts.pointsScored <= 0) return null;

  const runWorkout = isRunActivityType(opts.activityType, opts.leagueType);

  return {
    username: season.username,
    displayName: season.displayName,
    avatarUrl: season.avatarUrl,
    activityLabel: runWorkout ? 'Run' : 'Engine',
    leagueType: runWorkout ? 'run' : 'engine',
    pointsScored: Math.round(opts.pointsScored),
    durationMin: opts.durationMin,
    avgHrPercent: opts.avgHrPercent,
    avgPaceDisplay: opts.avgPaceDisplay,
    seasonRank: season.seasonRank,
    leagueLabel: season.leagueName,
  };
}

export async function buildWorkoutShareFromWorkoutRow(
  athleteId: string,
  row: WorkoutRow,
): Promise<WorkoutSharePayload | null> {
  const engine = Number(row.engine_score) || 0;
  const run = Number(row.run_score) || 0;
  const leagueType: 'engine' | 'run' = run > engine ? 'run' : 'engine';
  const points = Math.max(engine, run);
  if (points <= 0) return null;

  const { data: athleteRow } = await supabase
    .from('athletes')
    .select('max_hr, age')
    .eq('id', athleteId)
    .maybeSingle();

  const effectiveMaxHr =
    athleteRow?.max_hr != null
      ? Number(athleteRow.max_hr)
      : Math.max(1, 220 - Number(athleteRow?.age ?? 30));

  const avgHr = row.avg_hr != null ? Number(row.avg_hr) : null;
  const avgHrPercent = avgHr != null && effectiveMaxHr > 0 ? (avgHr / effectiveMaxHr) * 100 : null;
  const paceSec = row.avg_pace_per_km != null ? Number(row.avg_pace_per_km) : null;
  const avgPaceDisplay = paceSec != null && paceSec > 0 ? formatPaceDisplay(paceSec) : null;

  return basePayload(athleteId, {
    leagueType,
    pointsScored: points,
    durationMin: Number(row.duration_min) || 0,
    avgHrPercent,
    avgPaceDisplay,
    activityType: row.activity_type,
  });
}

export async function buildWorkoutShareFromActivityRow(
  athleteId: string,
  row: ActivityRow,
): Promise<WorkoutSharePayload | null> {
  const leagueType: 'engine' | 'run' = row.league_type === 'run' ? 'run' : 'engine';
  const duration = Number(row.duration_minutes) || 0;
  const hrPct = row.avg_hr_percent != null ? Number(row.avg_hr_percent) : null;
  const pace = row.avg_pace_seconds != null ? Number(row.avg_pace_seconds) : null;
  const points = activitySessionScore(leagueType, duration, hrPct, pace);
  if (points <= 0) return null;

  const avgPaceDisplay = pace != null && pace > 0 ? formatPaceDisplay(pace) : null;

  return basePayload(athleteId, {
    leagueType,
    pointsScored: points,
    durationMin: duration,
    avgHrPercent: hrPct,
    avgPaceDisplay,
    activityType: row.activity_type,
  });
}

/** Apple HealthKit sync — uses in-memory workout + RPC result before DB row is visible. */
export async function buildWorkoutShareFromAppleSync(
  athleteId: string,
  workout: WorkoutObject,
  result: ProcessActivityRpcResult,
): Promise<WorkoutSharePayload | null> {
  if (result.status !== 'scored') return null;

  const engine = Number(result.engine_score) || 0;
  const run = Number(result.run_score) || 0;
  const leagueType: 'engine' | 'run' = run > engine ? 'run' : 'engine';
  const points = Math.max(engine, run);
  if (points <= 0) return null;

  const { data: athleteRow } = await supabase
    .from('athletes')
    .select('max_hr, age')
    .eq('id', athleteId)
    .maybeSingle();

  const effectiveMaxHr =
    athleteRow?.max_hr != null
      ? Number(athleteRow.max_hr)
      : Math.max(1, 220 - Number(athleteRow?.age ?? 30));

  const avgHr = workout.avgHr != null ? Number(workout.avgHr) : null;
  const avgHrPercent = avgHr != null && effectiveMaxHr > 0 ? (avgHr / effectiveMaxHr) * 100 : null;
  const paceSec = workout.avgPacePerKm != null ? Number(workout.avgPacePerKm) : null;
  const avgPaceDisplay = paceSec != null && paceSec > 0 ? formatPaceDisplay(paceSec) : null;

  return basePayload(athleteId, {
    leagueType,
    pointsScored: points,
    durationMin: Number(workout.durationMin) || 0,
    avgHrPercent,
    avgPaceDisplay,
    activityType: workout.activityType,
  });
}
