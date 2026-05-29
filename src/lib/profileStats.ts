import { activitySessionScore } from '@/lib/activitySessionScore';
import { supabase } from '@/services/supabase';

export type ProfileSeasonStats = {
  seasonDisplay: string;
  engineScore: number;
  runScore: number;
};

export type ProfileCareerStats = {
  totalScoredWorkouts: number;
  allTimePoints: number;
  bestSession: number;
  topActivityType: string;
};

function numScore(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatSeasonDisplay(name: string | null | undefined): string {
  if (!name?.trim()) return 'Season 1 · Spring 2026';
  const trimmed = name.trim();
  const sep = trimmed.indexOf(' - ');
  if (sep > 0) {
    return `${trimmed.slice(0, sep).trim()} · ${trimmed.slice(sep + 3).trim()}`;
  }
  return trimmed;
}

export async function fetchProfileSeasonStats(athleteId: string): Promise<ProfileSeasonStats> {
  const empty: ProfileSeasonStats = {
    seasonDisplay: 'Season 1 · Spring 2026',
    engineScore: 0,
    runScore: 0,
  };

  const { data: season } = await supabase.from('seasons').select('id, name').eq('is_active', true).maybeSingle();
  if (!season?.id) return empty;

  const seasonId = String(season.id);
  const seasonDisplay = formatSeasonDisplay(typeof season.name === 'string' ? season.name : null);

  const { data: rows, error } = await supabase
    .from('athlete_stats')
    .select('category, score')
    .eq('athlete_id', athleteId)
    .eq('season_id', seasonId)
    .in('category', ['engine', 'run']);

  if (error || !rows?.length) {
    return { ...empty, seasonDisplay };
  }

  let engineScore = 0;
  let runScore = 0;
  for (const row of rows as { category: string; score: number | string | null }[]) {
    const pts = numScore(row.score);
    if (row.category === 'engine') engineScore = pts;
    else if (row.category === 'run') runScore = pts;
  }

  return { seasonDisplay, engineScore, runScore };
}

export type SeasonStanding = {
  /** Bar fill: share of athletes you outrank (0–100). */
  standingPercent: number;
  /** Label: Top X% (elite tier), e.g. 14 when you outrank 86%. */
  topPercent: number;
};

/** Global leaderboard standing for the profile season bar. */
export async function fetchSeasonStanding(athleteId: string): Promise<SeasonStanding> {
  const [{ data: lb }, { count }] = await Promise.all([
    supabase.from('leaderboard').select('rank').eq('id', athleteId).maybeSingle(),
    supabase.from('leaderboard').select('id', { count: 'exact', head: true }),
  ]);

  const rank = lb?.rank != null ? numScore(lb.rank as number | string) : 0;
  const total = count ?? 0;
  if (!rank || !total || total < 2) {
    return { standingPercent: 50, topPercent: 50 };
  }

  const standingPercent = Math.round((1 - (rank - 1) / total) * 100);
  const clamped = Math.max(4, Math.min(96, standingPercent));
  const topPercent = Math.max(1, Math.min(99, 100 - clamped));

  return { standingPercent: clamped, topPercent };
}

/** @deprecated Use fetchSeasonStanding — returns bar fill only. */
export async function fetchSeasonPercentile(athleteId: string): Promise<number> {
  const standing = await fetchSeasonStanding(athleteId);
  return standing.standingPercent;
}

function normalizeActivityLabel(raw: string | null | undefined): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'Workout';
  if (v.includes('run')) return 'Running';
  if (v.includes('walk')) return 'Walking';
  if (v.includes('cycle') || v.includes('bike')) return 'Cycling';
  if (v.includes('strength')) return 'Strength';
  if (v.includes('hiit')) return 'HIIT';
  if (v.includes('row')) return 'Rowing';
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export async function fetchProfileCareerStats(
  athleteId: string,
  allTimePoints: number,
): Promise<ProfileCareerStats> {
  const [{ count: workoutCount }, { count: activityCount }, { data: workoutRows }, { data: activityRows }] =
    await Promise.all([
      supabase
        .from('workouts')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .eq('status', 'scored'),
      supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId)
        .eq('status', 'scored'),
      supabase
        .from('workouts')
        .select('engine_score, run_score, activity_type')
        .eq('athlete_id', athleteId)
        .eq('status', 'scored'),
      supabase
        .from('activities')
        .select('activity_type, league_type, duration_minutes, avg_hr_percent, avg_pace_seconds')
        .eq('athlete_id', athleteId)
        .eq('status', 'scored'),
    ]);

  let bestSession = 0;
  const typeCounts = new Map<string, number>();

  for (const row of workoutRows ?? []) {
    const w = row as {
      engine_score: number | string | null;
      run_score: number | string | null;
      activity_type: string | null;
    };
    const session = numScore(w.engine_score) + numScore(w.run_score);
    if (session > bestSession) bestSession = session;
    const label = normalizeActivityLabel(w.activity_type);
    typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
  }

  for (const row of activityRows ?? []) {
    const a = row as {
      activity_type: string | null;
      league_type: string;
      duration_minutes: number | null;
      avg_hr_percent: number | null;
      avg_pace_seconds: number | null;
    };
    const session = activitySessionScore(
      a.league_type,
      a.duration_minutes ?? 0,
      a.avg_hr_percent,
      a.avg_pace_seconds,
    );
    if (session > bestSession) bestSession = session;
    const label = normalizeActivityLabel(a.activity_type ?? a.league_type);
    typeCounts.set(label, (typeCounts.get(label) ?? 0) + 1);
  }

  let topActivityType = '—';
  let topCount = 0;
  for (const [label, n] of typeCounts) {
    if (n > topCount) {
      topCount = n;
      topActivityType = label;
    }
  }

  return {
    totalScoredWorkouts: (workoutCount ?? 0) + (activityCount ?? 0),
    allTimePoints,
    bestSession: Math.round(bestSession * 10) / 10,
    topActivityType,
  };
}
