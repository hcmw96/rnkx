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

export type PromotionTimelineItem = {
  id: string;
  seasonLabel: string;
  league: 'engine' | 'run';
  result: 'promoted' | 'relegated' | 'held';
  fromDivision: string;
  toDivision: string;
  createdAt: string;
};

function numScore(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Short season name for timeline lines, e.g. "Season 2". */
export function seasonTimelineLabel(name: string | null | undefined): string {
  if (!name?.trim()) return 'Season';
  let trimmed = name.trim().replace(/^\[PLACEHOLDER\]\s*/i, '');
  const sep = trimmed.search(/\s+[—–-]\s+/);
  if (sep > 0) trimmed = trimmed.slice(0, sep).trim();
  return trimmed || 'Season';
}

export async function fetchPromotionTimeline(athleteId: string): Promise<PromotionTimelineItem[]> {
  const { data, error } = await supabase
    .from('promotion_history')
    .select('id, league, result, from_division, to_division, created_at, seasons(name, ends_at)')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false });

  if (error || !data?.length) return [];

  type Raw = {
    id: string;
    league: string;
    result: string;
    from_division: string;
    to_division: string;
    created_at: string;
    seasons?: { name?: string | null; ends_at?: string | null } | null;
  };

  return (data as Raw[]).map((row) => {
    const league = row.league === 'run' ? 'run' : 'engine';
    const result =
      row.result === 'promoted' || row.result === 'relegated' || row.result === 'held'
        ? row.result
        : 'held';
    return {
      id: row.id,
      seasonLabel: seasonTimelineLabel(row.seasons?.name),
      league,
      result,
      fromDivision: row.from_division,
      toDivision: row.to_division,
      createdAt: row.created_at,
    };
  });
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

/**
 * Season standing for the profile bar — rank within the athlete's division
 * for the active season (not lifetime). Uses the league where they have more
 * season points (engine vs run); ties prefer engine.
 */
export async function fetchSeasonStanding(athleteId: string): Promise<SeasonStanding> {
  const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).maybeSingle();
  if (!season?.id) return { standingPercent: 50, topPercent: 50 };

  const seasonId = String(season.id);
  const { data: mine } = await supabase
    .from('season_division_leaderboard')
    .select('league, division, rank, season_score')
    .eq('season_id', seasonId)
    .eq('id', athleteId)
    .in('league', ['engine', 'run']);

  type Row = {
    league: string;
    division: string;
    rank: number | string | null;
    season_score: number | string | null;
  };
  const rows = (mine ?? []) as Row[];
  if (!rows.length) return { standingPercent: 50, topPercent: 50 };

  const pick = [...rows].sort((a, b) => {
    const scoreDiff = numScore(b.season_score) - numScore(a.season_score);
    if (scoreDiff !== 0) return scoreDiff;
    return a.league === 'engine' ? -1 : 1;
  })[0];

  const rank = numScore(pick.rank);
  const { count } = await supabase
    .from('season_division_leaderboard')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', seasonId)
    .eq('league', pick.league)
    .eq('division', pick.division);

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
