import { activitySessionScore } from '@/lib/activitySessionScore';
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

function divisionLabel(division: string | null | undefined, category: 'engine' | 'run'): string {
  const div = division ?? 'Open';
  return category === 'run' ? `${div} Run League` : `${div} Engine League`;
}

export async function fetchSeasonShareStats(athleteId: string): Promise<SeasonShareStats | null> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  const [
    { data: athlete },
    { data: season },
    { data: lb },
    { data: statsRow },
    { data: bestWorkout },
    { data: weekWorkouts },
  ] = await Promise.all([
    supabase
      .from('athletes')
      .select('username, display_name, avatar_url, total_score, selected_leagues, max_hr, age')
      .eq('id', athleteId)
      .maybeSingle(),
    supabase.from('seasons').select('name').eq('is_active', true).maybeSingle(),
    supabase.from('leaderboard').select('rank, total_score').eq('id', athleteId).maybeSingle(),
    supabase
      .from('athlete_stats')
      .select('engine_rank, run_rank, engine_division, run_division')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
    supabase
      .from('workouts')
      .select('engine_score, run_score')
      .eq('athlete_id', athleteId)
      .eq('status', 'scored')
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workouts')
      .select('engine_score, run_score, duration_min, avg_hr, avg_pace_per_km, activity_type')
      .eq('athlete_id', athleteId)
      .eq('status', 'scored')
      .gte('started_at', weekAgoIso),
  ]);

  if (!athlete) return null;

  const selected = (athlete.selected_leagues as string[] | null) ?? ['engine', 'run'];
  const stats = statsRow as Record<string, unknown> | null;
  const engineRank = stats?.engine_rank != null ? Number(stats.engine_rank) : null;
  const runRank = stats?.run_rank != null ? Number(stats.run_rank) : null;

  let leagueName = 'RNKX League';
  let seasonRank: number | null = lb?.rank != null ? Number(lb.rank) : null;

  if (selected.includes('engine') && engineRank != null) {
    leagueName = divisionLabel(stats?.engine_division as string, 'engine');
    seasonRank = engineRank;
  } else if (selected.includes('run') && runRank != null) {
    leagueName = divisionLabel(stats?.run_division as string, 'run');
    seasonRank = runRank;
  }

  const maxHr =
    athlete.max_hr != null
      ? Number(athlete.max_hr)
      : Math.max(1, 220 - Number(athlete.age ?? 30));

  const weeklyPoints = (weekWorkouts ?? []).reduce((sum, row) => {
    const engine = Number(row.engine_score) || 0;
    const run = Number(row.run_score) || 0;
    if (engine + run > 0) return sum + engine + run;
    const league = run > 0 ? 'run' : 'engine';
    const pace = row.avg_pace_per_km != null ? Number(row.avg_pace_per_km) : null;
    const hrPct =
      row.avg_hr != null && maxHr > 0 ? (Number(row.avg_hr) / maxHr) * 100 : null;
    return (
      sum +
      activitySessionScore(league, Number(row.duration_min) || 0, hrPct, pace)
    );
  }, 0);

  const bestWorkoutScore = bestWorkout
    ? Math.round(Number(bestWorkout.engine_score) + Number(bestWorkout.run_score))
    : 0;

  return {
    seasonName: season?.name ?? 'Season 1',
    username: athlete.username ?? 'athlete',
    displayName: athlete.display_name ?? athlete.username ?? 'Athlete',
    avatarUrl: athlete.avatar_url,
    totalPoints: Math.round(Number(lb?.total_score ?? athlete.total_score) || 0),
    bestWorkoutScore,
    weeklyPoints: Math.round(weeklyPoints),
    leagueName,
    seasonRank,
  };
}
