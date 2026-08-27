import { activitySessionScore } from '@/lib/activitySessionScore';
import { fetchMyDivisions } from '@/lib/athleteDivisions';
import { computeCategoryRank, fetchLiveCategoryRanks } from '@/lib/categoryRank';
import { athleteAvatarDisplayUrl, leagueFromSelectedLeagues } from '@/lib/leagueAvatars';
import { supabase } from '@/services/supabase';

export type SeasonShareStats = {
  seasonName: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  totalPoints: number;
  bestWorkoutScore: number;
  weeklyPoints: number;
  leagueName: string;
  seasonRank: number | null;
};

function divisionLabel(division: string, category: 'engine' | 'run'): string {
  return category === 'run' ? `${division} Run League` : `${division} Engine League`;
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function workoutPoints(
  row: {
    engine_score?: unknown;
    run_score?: unknown;
    duration_min?: unknown;
    avg_hr?: unknown;
    avg_pace_per_km?: unknown;
  },
  maxHr?: number,
): number {
  const engine = num(row.engine_score);
  const run = num(row.run_score);
  if (engine + run > 0) return Math.round(engine + run);

  const league = run > 0 ? 'run' : 'engine';
  const pace = row.avg_pace_per_km != null ? num(row.avg_pace_per_km) : null;
  const duration = num(row.duration_min);
  const hrPct =
    row.avg_hr != null && maxHr != null && maxHr > 0 ? (num(row.avg_hr) / maxHr) * 100 : null;
  return Math.round(activitySessionScore(league, duration, hrPct, pace));
}

type SeasonStatRow = { category: string; score: unknown };

export async function fetchSeasonShareStats(athleteId: string): Promise<SeasonShareStats | null> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, starts_at')
    .eq('is_active', true)
    .maybeSingle();

  const seasonId = (season?.id as string | undefined) ?? null;
  const seasonStartsAt = (season?.starts_at as string | undefined) ?? null;

  let seasonStatsQuery = supabase
    .from('athlete_stats')
    .select('category, score')
    .eq('athlete_id', athleteId)
    .in('category', ['engine', 'run']);

  if (seasonId) {
    seasonStatsQuery = seasonStatsQuery.eq('season_id', seasonId);
  }

  let workoutsQuery = supabase
    .from('workouts')
    .select('engine_score, run_score, duration_min, avg_hr, avg_pace_per_km, started_at')
    .eq('athlete_id', athleteId)
    .eq('status', 'scored');

  if (seasonStartsAt) {
    workoutsQuery = workoutsQuery.gte('started_at', seasonStartsAt);
  }

  const [
    { data: athlete },
    { data: lb },
    { data: seasonStatRows },
    liveRanks,
    { data: seasonWorkouts },
    { data: weekWorkouts },
    divisions,
  ] = await Promise.all([
    supabase
      .from('athletes')
      .select('username, display_name, avatar_url, total_score, selected_leagues, max_hr, age')
      .eq('id', athleteId)
      .maybeSingle(),
    supabase.from('leaderboard').select('rank, total_score').eq('id', athleteId).maybeSingle(),
    seasonStatsQuery,
    seasonId
      ? fetchLiveCategoryRanks(athleteId, seasonId)
      : Promise.resolve({ engine: null, run: null }),
    workoutsQuery,
    supabase
      .from('workouts')
      .select('engine_score, run_score, duration_min, avg_hr, avg_pace_per_km, started_at')
      .eq('athlete_id', athleteId)
      .eq('status', 'scored')
      .gte('started_at', weekAgoIso),
    seasonId
      ? fetchMyDivisions(athleteId, seasonId)
      : Promise.resolve({ engine: 'Open' as const, run: 'Open' as const }),
  ]);

  if (!athlete) return null;

  const maxHr =
    athlete.max_hr != null ? num(athlete.max_hr) : Math.max(1, 220 - num(athlete.age ?? 30));

  const selected = (athlete.selected_leagues as string[] | null) ?? ['engine', 'run'];
  const byCategory = new Map<string, SeasonStatRow>();
  for (const row of (seasonStatRows ?? []) as SeasonStatRow[]) {
    if (row.category) byCategory.set(row.category, row);
  }

  const engineRow = byCategory.get('engine');
  const runRow = byCategory.get('run');
  const engineScoreFromRows = num(engineRow?.score);
  const runScoreFromRows = num(runRow?.score);
  const totalFromCategoryRows = engineScoreFromRows + runScoreFromRows;

  let totalPoints = totalFromCategoryRows;
  if (totalPoints <= 0) totalPoints = num(lb?.total_score ?? athlete.total_score);

  let bestWorkoutScore = 0;
  for (const row of seasonWorkouts ?? []) {
    const pts = workoutPoints(row, maxHr);
    if (pts > bestWorkoutScore) bestWorkoutScore = pts;
  }

  const weeklyPoints = (weekWorkouts ?? []).reduce((sum, row) => sum + workoutPoints(row, maxHr), 0);

  let engineRank = liveRanks.engine;
  let runRank = liveRanks.run;
  if (seasonId) {
    const [fallbackEngine, fallbackRun] = await Promise.all([
      engineRank == null && engineScoreFromRows > 0
        ? computeCategoryRank(seasonId, 'engine', engineScoreFromRows)
        : Promise.resolve(engineRank),
      runRank == null && runScoreFromRows > 0
        ? computeCategoryRank(seasonId, 'run', runScoreFromRows)
        : Promise.resolve(runRank),
    ]);
    engineRank = fallbackEngine;
    runRank = fallbackRun;
  }

  let leagueName = 'RNKX League';
  let seasonRank: number | null = lb?.rank != null ? num(lb.rank) : null;

  if (selected.includes('engine') && engineRank != null && engineRank > 0) {
    leagueName = divisionLabel(divisions.engine, 'engine');
    seasonRank = engineRank;
  } else if (selected.includes('run') && runRank != null && runRank > 0) {
    leagueName = divisionLabel(divisions.run, 'run');
    seasonRank = runRank;
  }

  const seasonLabel = season?.name ?? 'Season 1';
  const shortSeason =
    seasonLabel.includes(' - ') ? seasonLabel.split(' - ')[0].trim() : seasonLabel;

  return {
    seasonName: shortSeason,
    username: athlete.username ?? 'athlete',
    displayName: athlete.display_name ?? athlete.username ?? 'Athlete',
    avatarUrl: athleteAvatarDisplayUrl(
      athlete.avatar_url,
      leagueFromSelectedLeagues(athlete.selected_leagues as string[] | null),
    ),
    totalPoints: Math.round(totalPoints),
    bestWorkoutScore: Math.round(bestWorkoutScore),
    weeklyPoints: Math.round(weeklyPoints),
    leagueName,
    seasonRank: seasonRank > 0 ? seasonRank : null,
  };
}
