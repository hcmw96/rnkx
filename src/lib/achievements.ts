import { activitySessionScore } from '@/lib/activitySessionScore';
import { divisionForRank } from '@/lib/division';
import type { ProfileCareerStats, ProfileSeasonStats } from '@/lib/profileStats';
import { supabase } from '@/services/supabase';

export type AchievementColor = 'gold' | 'lime' | 'cyan' | 'gradient';

export type AchievementDefinition = {
  id: string;
  name: string;
  /** Shown under the badge name so users know how to earn it. */
  criteria: string;
  color: AchievementColor;
};

export type AchievementState = AchievementDefinition & {
  unlocked: boolean;
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'founder', name: 'Founder', criteria: 'Joined Season 1', color: 'gold' },
  { id: 'century', name: 'Century', criteria: 'First 150+ pt session', color: 'lime' },
  { id: 'engine-room', name: 'Engine Room', criteria: '8,000 engine league pts', color: 'lime' },
  { id: 'pacemaker', name: 'Pacemaker', criteria: '8,000 run league pts', color: 'cyan' },
  { id: 'double-day', name: 'Double Day', criteria: 'Engine + run same day', color: 'gradient' },
  { id: 'iron-week', name: 'Iron Week', criteria: '7-day scoring streak', color: 'gradient' },
  { id: 'promoted', name: 'Promoted', criteria: 'Moved up a division', color: 'gradient' },
  { id: 'top-3', name: 'Top 3', criteria: 'Podium finish in a season', color: 'gold' },
  { id: 'recruiter', name: 'Recruiter', criteria: 'Friend joined and scored', color: 'gradient' },
];

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

async function fetchScoredDaysByCategory(athleteId: string): Promise<Map<string, { engine: boolean; run: boolean }>> {
  const map = new Map<string, { engine: boolean; run: boolean }>();

  const mark = (iso: string, engine: boolean, run: boolean) => {
    const key = dayKey(iso);
    if (!key) return;
    const cur = map.get(key) ?? { engine: false, run: false };
    if (engine) cur.engine = true;
    if (run) cur.run = true;
    map.set(key, cur);
  };

  const [{ data: workouts }, { data: activities }] = await Promise.all([
    supabase
      .from('workouts')
      .select('created_at, engine_score, run_score, activity_type')
      .eq('athlete_id', athleteId)
      .eq('status', 'scored'),
    supabase
      .from('activities')
      .select('created_at, league_type, duration_minutes, avg_hr_percent, avg_pace_seconds')
      .eq('athlete_id', athleteId)
      .eq('status', 'scored'),
  ]);

  for (const row of workouts ?? []) {
    const w = row as {
      created_at: string;
      engine_score: number | string | null;
      run_score: number | string | null;
      activity_type: string | null;
    };
    const enginePts = num(w.engine_score);
    const runPts = num(w.run_score);
    const t = String(w.activity_type ?? '').toLowerCase();
    mark(w.created_at, enginePts > 0 || t.includes('engine') || t.includes('hr'), runPts > 0 || t.includes('run'));
  }

  for (const row of activities ?? []) {
    const a = row as {
      created_at: string;
      league_type: string;
      duration_minutes: number | null;
      avg_hr_percent: number | null;
      avg_pace_seconds: number | null;
    };
    const pts = activitySessionScore(
      a.league_type,
      a.duration_minutes ?? 0,
      a.avg_hr_percent,
      a.avg_pace_seconds,
    );
    if (pts <= 0) continue;
    if (a.league_type === 'engine') mark(a.created_at, true, false);
    else if (a.league_type === 'run') mark(a.created_at, false, true);
  }

  return map;
}

function hasSevenDayStreak(dayKeys: string[]): boolean {
  if (dayKeys.length < 7) return false;
  const sorted = [...new Set(dayKeys)].sort();
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T12:00:00Z`).getTime();
    const cur = new Date(`${sorted[i]}T12:00:00Z`).getTime();
    const diffDays = Math.round((cur - prev) / 86_400_000);
    if (diffDays === 1) {
      streak += 1;
      if (streak >= 7) return true;
    } else if (diffDays > 1) {
      streak = 1;
    }
  }
  return false;
}

async function hasRecruitedScoringFriend(athleteId: string): Promise<boolean> {
  const { data: friendships } = await supabase
    .from('friendships')
    .select('friend_id')
    .eq('athlete_id', athleteId)
    .eq('status', 'accepted');

  const friendIds = (friendships ?? []).map((f) => String((f as { friend_id?: string }).friend_id ?? '')).filter(Boolean);
  if (!friendIds.length) return false;

  for (const fid of friendIds) {
    const [{ count: w }, { count: a }] = await Promise.all([
      supabase
        .from('workouts')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', fid)
        .eq('status', 'scored'),
      supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', fid)
        .eq('status', 'scored'),
    ]);
    if ((w ?? 0) + (a ?? 0) > 0) return true;
  }
  return false;
}

async function isSeasonOneMember(): Promise<boolean> {
  const { data: season } = await supabase.from('seasons').select('name').eq('is_active', true).maybeSingle();
  const name = typeof season?.name === 'string' ? season.name.trim().toLowerCase() : '';
  return name.includes('season 1') || name.startsWith('season 1');
}

export async function fetchAchievementStates(
  athleteId: string,
  season: ProfileSeasonStats | null,
  career: ProfileCareerStats | null,
): Promise<AchievementState[]> {
  const engineScore = season?.engineScore ?? 0;
  const runScore = season?.runScore ?? 0;
  const bestSession = career?.bestSession ?? 0;

  const [dayMap, seasonOne, recruiter, statsRows] = await Promise.all([
    fetchScoredDaysByCategory(athleteId),
    isSeasonOneMember(),
    hasRecruitedScoringFriend(athleteId),
    supabase
      .from('athlete_stats')
      .select('category, rank')
      .eq('athlete_id', athleteId)
      .in('category', ['engine', 'run']),
  ]);

  const dayKeys = [...dayMap.keys()];
  let doubleDay = false;
  for (const flags of dayMap.values()) {
    if (flags.engine && flags.run) {
      doubleDay = true;
      break;
    }
  }

  const ironWeek = hasSevenDayStreak(dayKeys);

  let engineRank: number | null = null;
  let runRank: number | null = null;
  for (const row of statsRows.data ?? []) {
    const r = row as { category: string; rank: number | string | null };
    const rank = num(r.rank);
    if (rank <= 0) continue;
    if (r.category === 'engine') engineRank = rank;
    else if (r.category === 'run') runRank = rank;
  }

  const ranks = [engineRank, runRank].filter((r): r is number => r != null);
  const top3 = ranks.some((r) => r <= 3);
  const promoted = ranks.some((r) => divisionForRank(r) !== 'Open');

  const unlockById: Record<string, boolean> = {
    founder: seasonOne,
    century: bestSession >= 150,
    'engine-room': engineScore >= 8000,
    pacemaker: runScore >= 8000,
    'double-day': doubleDay,
    'iron-week': ironWeek,
    promoted,
    'top-3': top3,
    recruiter,
  };

  return ACHIEVEMENTS.map((def) => ({
    ...def,
    unlocked: unlockById[def.id] ?? false,
  }));
}
