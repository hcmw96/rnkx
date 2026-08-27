import { activitySessionScore } from '@/lib/activitySessionScore';
import { fetchMyDivision } from '@/lib/athleteDivisions';
import { computeCategoryRank, fetchLiveCategoryRank } from '@/lib/categoryRank';
import type { Division } from '@/lib/division';
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

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
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

/** Current league rank from season_division_leaderboard (id + league), plus division membership. */
async function standingForLeague(
  athleteId: string,
  leagueType: 'engine' | 'run',
): Promise<{ seasonRank: number | null; division: Division }> {
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .maybeSingle();

  const seasonId = (season?.id as string | undefined) ?? null;

  const division: Division = seasonId
    ? await fetchMyDivision(athleteId, seasonId, leagueType)
    : 'Open';

  if (!seasonId) {
    return { seasonRank: null, division };
  }

  const liveRank = await fetchLiveCategoryRank(athleteId, seasonId, leagueType);
  if (liveRank != null) {
    return { seasonRank: liveRank, division };
  }

  const { data: scoreRow } = await supabase
    .from('athlete_stats')
    .select('score')
    .eq('athlete_id', athleteId)
    .eq('season_id', seasonId)
    .eq('category', leagueType)
    .maybeSingle();

  const score = num(scoreRow?.score);
  const fallbackRank = score > 0 ? await computeCategoryRank(seasonId, leagueType, score) : null;

  return { seasonRank: fallbackRank, division };
}

async function basePayload(
  athleteId: string,
  opts: {
    leagueType: 'engine' | 'run';
    pointsScored: number;
    activityType: string | null;
  },
): Promise<WorkoutSharePayload | null> {
  if (opts.pointsScored <= 0) return null;

  const runWorkout = isRunActivityType(opts.activityType, opts.leagueType);
  const leagueType: 'engine' | 'run' = runWorkout ? 'run' : 'engine';
  const standing = await standingForLeague(athleteId, leagueType);

  return {
    leagueType,
    pointsScored: Math.round(opts.pointsScored),
    seasonRank: standing.seasonRank,
    division: standing.division,
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

  return basePayload(athleteId, {
    leagueType,
    pointsScored: points,
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

  return basePayload(athleteId, {
    leagueType,
    pointsScored: points,
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

  return basePayload(athleteId, {
    leagueType,
    pointsScored: points,
    activityType: workout.activityType,
  });
}
