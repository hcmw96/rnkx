import { activitySessionScore } from '@/lib/activitySessionScore';
import { fetchAcceptedFriendIds } from '@/lib/friendships';
import type { ProfileCareerStats, ProfileSeasonStats } from '@/lib/profileStats';
import { fetchProfileCareerStats, fetchProfileSeasonStats } from '@/lib/profileStats';
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
  unlockedAt?: string | null;
  celebratedAt?: string | null;
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'founder', name: 'Founder', criteria: 'Joined Season 1', color: 'gold' },
  { id: 'century', name: 'Century', criteria: 'First 100+ pt session', color: 'lime' },
  { id: 'engine-room', name: 'Engine Room', criteria: '8,000 engine league pts', color: 'lime' },
  { id: 'pacemaker', name: 'Pacemaker', criteria: '8,000 run league pts', color: 'cyan' },
  { id: 'double-day', name: 'Double Day', criteria: 'Engine + run same day', color: 'gradient' },
  { id: 'iron-week', name: 'Iron Week', criteria: '7-day scoring streak', color: 'gradient' },
  { id: 'promoted', name: 'Promoted', criteria: 'Promoted at season end', color: 'gradient' },
  { id: 'top-3', name: 'Top 3', criteria: 'Finish top 3 when a season ends', color: 'gold' },
  { id: 'recruiter', name: 'Recruiter', criteria: 'Friend joined and scored', color: 'gradient' },
];

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_BY_ID.get(id);
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Competition days are Europe/London calendar dates, matching scoring weeks. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

type StoredAchievementRow = {
  achievement_id: string;
  unlocked_at: string;
  celebrated_at: string | null;
};

async function fetchStoredAchievementRows(athleteId: string): Promise<StoredAchievementRow[]> {
  const { data, error } = await supabase
    .from('athlete_achievements')
    .select('achievement_id, unlocked_at, celebrated_at')
    .eq('athlete_id', athleteId);

  if (error) {
    console.warn('[achievements] fetch stored failed', error.message);
    return [];
  }

  return (data ?? []) as StoredAchievementRow[];
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
      .select('started_at, created_at, engine_score, run_score')
      .eq('athlete_id', athleteId)
      .eq('status', 'scored'),
    supabase
      .from('activities')
      .select('workout_start_time, activity_date, created_at, league_type, duration_minutes, avg_hr_percent, avg_pace_seconds')
      .eq('athlete_id', athleteId)
      .eq('status', 'scored'),
  ]);

  for (const row of workouts ?? []) {
    const w = row as {
      started_at: string | null;
      created_at: string;
      engine_score: number | string | null;
      run_score: number | string | null;
    };
    const enginePts = num(w.engine_score);
    const runPts = num(w.run_score);
    if (enginePts <= 0 && runPts <= 0) continue;
    mark(w.started_at || w.created_at, enginePts > 0, runPts > 0);
  }

  for (const row of activities ?? []) {
    const a = row as {
      workout_start_time: string | null;
      activity_date: string | null;
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
    const when = a.workout_start_time || a.activity_date || a.created_at;
    if (a.league_type === 'engine') mark(when, true, false);
    else if (a.league_type === 'run') mark(when, false, true);
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

async function hasRecruitedScoringFriend(athleteId: string, joinedAt: string | null): Promise<boolean> {
  const friendIds = await fetchAcceptedFriendIds(athleteId);
  if (!friendIds.length || !joinedAt) return false;
  const joinedMs = Date.parse(joinedAt);
  if (!Number.isFinite(joinedMs)) return false;

  const { data: friends } = await supabase
    .from('athletes')
    .select('id, created_at')
    .in('id', friendIds);
  const laterJoiners = (friends ?? [])
    .filter((row) => {
      const created = Date.parse(String((row as { created_at?: string }).created_at ?? ''));
      return Number.isFinite(created) && created > joinedMs;
    })
    .map((row) => String((row as { id: string }).id));
  if (!laterJoiners.length) return false;

  for (const fid of laterJoiners) {
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

async function fetchSeasonEndEligibility(athleteId: string): Promise<{
  founder: boolean;
  top3: boolean;
  promoted: boolean;
  joinedAt: string | null;
}> {
  const [{ data: athlete }, { data: seasons }, { data: promotions }] = await Promise.all([
    supabase.from('athletes').select('created_at, is_comped').eq('id', athleteId).maybeSingle(),
    supabase.from('seasons').select('id, name, is_active, ends_at'),
    supabase
      .from('promotion_history')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('result', 'promoted')
      .limit(1),
  ]);

  const joinedAt = athlete?.created_at ? String(athlete.created_at) : null;
  const isComped = athlete?.is_comped === true;
  const seasonRows = (seasons ?? []) as {
    id: string;
    name: string | null;
    is_active: boolean | null;
    ends_at: string | null;
  }[];

  const season1 = seasonRows.find((s) => {
    const name = (s.name ?? '').trim().toLowerCase();
    return name.includes('season 1') || name.startsWith('season 1');
  });
  let founder = isComped;
  if (!founder && joinedAt && season1?.ends_at) {
    const joinedMs = Date.parse(joinedAt);
    const endsMs = Date.parse(season1.ends_at);
    founder = Number.isFinite(joinedMs) && Number.isFinite(endsMs) && joinedMs <= endsMs;
  }

  const finishedIds = seasonRows.filter((s) => s.is_active === false).map((s) => s.id);
  let top3 = false;
  if (finishedIds.length) {
    const { data: podium } = await supabase
      .from('season_division_leaderboard')
      .select('rank')
      .eq('id', athleteId)
      .in('season_id', finishedIds)
      .lte('rank', 3)
      .limit(1);
    top3 = (podium ?? []).length > 0;
  }

  return {
    founder,
    top3,
    promoted: (promotions ?? []).length > 0,
    joinedAt,
  };
}

async function computeUnlockEligibility(
  athleteId: string,
  season: ProfileSeasonStats | null,
  career: ProfileCareerStats | null,
): Promise<Record<string, boolean>> {
  const engineScore = season?.engineScore ?? 0;
  const runScore = season?.runScore ?? 0;
  const bestSession = career?.bestSession ?? 0;

  const [dayMap, seasonEnd] = await Promise.all([
    fetchScoredDaysByCategory(athleteId),
    fetchSeasonEndEligibility(athleteId),
  ]);
  const recruiter = await hasRecruitedScoringFriend(athleteId, seasonEnd.joinedAt);

  const dayKeys = [...dayMap.keys()];
  let doubleDay = false;
  for (const flags of dayMap.values()) {
    if (flags.engine && flags.run) {
      doubleDay = true;
      break;
    }
  }

  const ironWeek = hasSevenDayStreak(dayKeys);

  return {
    founder: seasonEnd.founder,
    century: bestSession >= 100,
    'engine-room': engineScore >= 8000,
    pacemaker: runScore >= 8000,
    'double-day': doubleDay,
    'iron-week': ironWeek,
    promoted: seasonEnd.promoted,
    'top-3': seasonEnd.top3,
    recruiter,
  };
}

function statesFromStored(stored: StoredAchievementRow[]): AchievementState[] {
  const storedById = new Map(stored.map((r) => [r.achievement_id, r]));

  return ACHIEVEMENTS.map((def) => {
    const row = storedById.get(def.id);
    return {
      ...def,
      unlocked: !!row,
      unlockedAt: row?.unlocked_at ?? null,
      celebratedAt: row?.celebrated_at ?? null,
    };
  });
}

function toAchievementState(def: AchievementDefinition, row?: StoredAchievementRow): AchievementState {
  return {
    ...def,
    unlocked: true,
    unlockedAt: row?.unlocked_at ?? null,
    celebratedAt: row?.celebrated_at ?? null,
  };
}

export type AchievementSyncResult = {
  states: AchievementState[];
  /** Unlocks inserted this sync that should be celebrated in-app. */
  newlyUnlocked: AchievementState[];
  /** Previously unlocked but not yet celebrated (e.g. app closed mid-modal). */
  pendingCelebration: AchievementState[];
};

export async function markAchievementsCelebrated(athleteId: string, achievementIds: string[]): Promise<void> {
  if (!achievementIds.length) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('athlete_achievements')
    .update({ celebrated_at: now })
    .eq('athlete_id', athleteId)
    .in('achievement_id', achievementIds)
    .is('celebrated_at', null);

  if (error) {
    console.warn('[achievements] mark celebrated failed', error.message);
  }
}

export async function syncAthleteAchievements(
  athleteId: string,
  season?: ProfileSeasonStats | null,
  career?: ProfileCareerStats | null,
  allTimePoints?: number,
): Promise<AchievementSyncResult> {
  let seasonStats = season ?? null;
  let careerStats = career ?? null;

  if (!seasonStats) {
    seasonStats = await fetchProfileSeasonStats(athleteId);
  }

  if (!careerStats) {
    let allTime = allTimePoints;
    if (allTime == null) {
      const { data } = await supabase.from('athletes').select('total_score').eq('id', athleteId).maybeSingle();
      allTime = num(data?.total_score);
    }
    careerStats = await fetchProfileCareerStats(athleteId, allTime);
  }

  const [eligibility, storedBefore] = await Promise.all([
    computeUnlockEligibility(athleteId, seasonStats, careerStats),
    fetchStoredAchievementRows(athleteId),
  ]);

  const storedIds = new Set(storedBefore.map((r) => r.achievement_id));
  const toInsert = ACHIEVEMENTS.filter((def) => eligibility[def.id] && !storedIds.has(def.id));

  const isBackfill = storedBefore.length === 0 && toInsert.length > 1;
  const now = new Date().toISOString();
  const insertedIds: string[] = [];

  if (toInsert.length) {
    const rows = toInsert.map((def) => ({
      athlete_id: athleteId,
      achievement_id: def.id,
      unlocked_at: now,
      celebrated_at: isBackfill ? now : null,
    }));

    const { data: inserted, error } = await supabase
      .from('athlete_achievements')
      .insert(rows)
      .select('achievement_id');
    if (error) {
      console.warn('[achievements] insert failed', error.message);
    } else {
      insertedIds.push(
        ...(inserted ?? []).map((row) => String((row as { achievement_id?: string }).achievement_id ?? '')).filter(Boolean),
      );
    }
  }

  const storedAfter = insertedIds.length
    ? await fetchStoredAchievementRows(athleteId)
    : storedBefore;

  const states = statesFromStored(storedAfter);

  const storedById = new Map(storedAfter.map((r) => [r.achievement_id, r]));

  const newlyUnlocked: AchievementState[] = isBackfill
    ? []
    : insertedIds
        .map((id) => {
          const def = getAchievementDefinition(id);
          if (!def) return null;
          return toAchievementState(def, storedById.get(id));
        })
        .filter((s): s is AchievementState => s != null);

  const pendingCelebration: AchievementState[] = storedAfter
    .filter((r) => r.celebrated_at == null && !insertedIds.includes(r.achievement_id))
    .map((r) => {
      const def = getAchievementDefinition(r.achievement_id);
      if (!def) return null;
      return toAchievementState(def, r);
    })
    .filter((s): s is AchievementState => s != null);

  return { states, newlyUnlocked, pendingCelebration };
}

/** Profile display: sync DB then return badge states. */
export async function fetchAchievementStates(
  athleteId: string,
  season: ProfileSeasonStats | null,
  career: ProfileCareerStats | null,
): Promise<AchievementState[]> {
  const { states } = await syncAthleteAchievements(athleteId, season, career);
  return states;
}
