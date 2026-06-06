import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { activitySessionScore } from '@/lib/activitySessionScore';
import { formatScore } from '@/lib/formatScore';
import {
  activityScoringOutcome,
  workoutScoringOutcome,
  type ScoringOutcome,
} from '@/lib/adminScoringOutcome';
import {
  ADMIN_PASSWORD,
  hasAdminUiAccess,
  isAllowlistedAdminUsername,
  resolveCurrentUsername,
  setAdminPasswordSession,
} from '@/lib/adminAccess';
import { supabase } from '@/services/supabase';

type LeagueTab = 'engine' | 'run';

type AthleteRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  total_score: number | null;
  wearables: string[] | null;
  data_source: string | null;
  last_synced: string | null;
  max_hr: number | null;
  age: number | null;
};

type LeaderboardRow = {
  athlete_id: string;
  category: string;
  score: number | string | null;
  rank: number | null;
  athletes?: { username: string | null; display_name: string | null } | null;
};

type WorkoutRow = {
  id: string;
  started_at: string;
  activity_type: string | null;
  duration_min: number | string | null;
  avg_hr: number | string | null;
  avg_pace_per_km: number | string | null;
  engine_score: number | string | null;
  run_score: number | string | null;
  status: string | null;
  reject_reason: string | null;
};

type ActivityRow = {
  id: string;
  activity_date: string;
  activity_type: string | null;
  duration_minutes: number | string | null;
  avg_hr_percent: number | string | null;
  avg_pace_seconds: number | string | null;
  league_type: string | null;
  status: string | null;
};

type ConnectionSummary = {
  terra_providers: string[];
  has_whoop: boolean;
};

function paceDisplayFromSeconds(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  const total = Math.round(value);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${String(sec).padStart(2, '0')} /km`;
}

function dateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString();
}

function mapWearableToken(low: string): string | null {
  if (low === 'apple_watch' || low === 'apple') return 'Apple Watch';
  if (low === 'whoop') return 'WHOOP';
  if (low === 'garmin') return 'GARMIN';
  if (low === 'polar') return 'POLAR';
  if (low === 'coros') return 'COROS';
  if (low === 'fitbit') return 'FITBIT';
  if (low === 'oura') return 'OURA';
  if (low === 'samsung') return 'SAMSUNG';
  if (low === 'strava') return 'STRAVA';
  if (!low) return null;
  return low.toUpperCase();
}

/** Prefer Terra + WHOOP connection tables (admin RPC); ignore misleading apple_watch on Terra-only athletes. */
function buildWearableDisplay(athlete: AthleteRow, summary: ConnectionSummary | undefined): string {
  const terra = (summary?.terra_providers ?? [])
    .map((p) => String(p).trim().toUpperCase())
    .filter(Boolean);
  const hasWhoop = summary?.has_whoop === true;
  const parts: string[] = [];

  if (terra.length > 0) {
    for (const label of terra) {
      if (!parts.includes(label)) parts.push(label);
    }
  } else {
    const raw = athlete.wearables ?? [];
    for (const w of raw) {
      const low = String(w).trim().toLowerCase();
      if (low === 'whoop') continue;
      const mapped = mapWearableToken(low);
      if (mapped && !parts.includes(mapped)) parts.push(mapped);
    }
    if (parts.length === 0) {
      const ds = (athlete.data_source ?? '').toLowerCase();
      if (ds === 'terra') parts.push('GARMIN');
      else if (ds === 'apple') parts.push('Apple Watch');
    }
  }

  if (hasWhoop && !parts.includes('WHOOP')) parts.push('WHOOP');

  return parts.length > 0 ? parts.join(', ') : '—';
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<LeagueTab>('engine');

  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<LeagueTab>('engine');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailWorkouts, setDetailWorkouts] = useState<WorkoutRow[]>([]);
  const [detailActivities, setDetailActivities] = useState<ActivityRow[]>([]);
  const [wearableSummaryByAthlete, setWearableSummaryByAthlete] = useState<Record<string, ConnectionSummary>>({});

  useEffect(() => {
    void (async () => {
      const allowed = await hasAdminUiAccess();
      setAuthed(allowed);
    })();
  }, []);

  useEffect(() => {
    if (!authed) return;
    void (async () => {
      setLoading(true);
      setError(null);

      const { data: dashboardJson, error: dashboardErr } = await supabase.rpc('admin_get_dashboard');

      if (dashboardErr) {
        const msg = dashboardErr.message;
        if (/forbidden/i.test(msg)) {
          setAuthed(false);
          setAuthError('Your account is not authorized for admin. Contact support if this is unexpected.');
          setAthletes([]);
          setLeaderboardRows([]);
          setLoading(false);
          return;
        }
        setError(msg);
        setLoading(false);
        return;
      }

      const payload = dashboardJson as {
        season_id?: string | null;
        athletes?: AthleteRow[] | null;
        leaderboard?: {
          athlete_id: string;
          category: string;
          score: number | string | null;
          rank: number | null;
          username?: string | null;
          display_name?: string | null;
        }[] | null;
      };

      const athletesList = (payload.athletes as AthleteRow[] | null) ?? [];
      setAthletes(athletesList);
      if (athletesList.length > 0) {
        setSelectedAthleteId((prev) => prev ?? athletesList[0].id);
      }

      const lbRows: LeaderboardRow[] = (payload.leaderboard ?? []).map((row) => ({
        athlete_id: row.athlete_id,
        category: row.category,
        score: row.score,
        rank: row.rank,
        athletes: {
          username: row.username ?? null,
          display_name: row.display_name ?? null,
        },
      }));
      setLeaderboardRows(lbRows);

      const ids = athletesList.map((a) => a.id);
      if (ids.length > 0) {
        const { data: summaryJson, error: summaryErr } = await supabase.rpc('admin_athlete_wearable_summary', {
          p_athlete_ids: ids,
        });
        if (summaryErr) {
          setError((prev) => prev ?? summaryErr.message);
          setWearableSummaryByAthlete({});
        } else {
          const next: Record<string, ConnectionSummary> = {};
          const raw = summaryJson as Record<string, { terra_providers?: unknown; has_whoop?: unknown }> | null;
          if (raw && typeof raw === 'object') {
            for (const [athleteId, v] of Object.entries(raw)) {
              const tp = v?.terra_providers;
              next[athleteId] = {
                terra_providers: Array.isArray(tp) ? tp.map((x) => String(x)) : [],
                has_whoop: Boolean(v?.has_whoop),
              };
            }
          }
          setWearableSummaryByAthlete(next);
        }
      } else {
        setWearableSummaryByAthlete({});
      }

      setLoading(false);
    })();
  }, [authed]);

  useEffect(() => {
    if (!authed || !selectedAthleteId) {
      setDetailWorkouts([]);
      setDetailActivities([]);
      return;
    }
    void (async () => {
      setDetailLoading(true);
      setDetailError(null);
      const { data, error: rpcErr } = await supabase.rpc('admin_list_athlete_recent_activity', {
        p_athlete_id: selectedAthleteId,
        p_limit: 250,
      });

      if (rpcErr) {
        setDetailError(
          /forbidden/i.test(rpcErr.message)
            ? 'Forbidden — your account is not on the admin allowlist.'
            : rpcErr.message,
        );
        setDetailWorkouts([]);
        setDetailActivities([]);
        setDetailLoading(false);
        return;
      }

      const payload = (data ?? {}) as {
        workouts?: WorkoutRow[] | null;
        activities?: ActivityRow[] | null;
      };

      setDetailWorkouts((payload.workouts as WorkoutRow[] | null) ?? []);
      setDetailActivities((payload.activities as ActivityRow[] | null) ?? []);
      setDetailLoading(false);
    })();
  }, [authed, selectedAthleteId]);

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null,
    [athletes, selectedAthleteId],
  );

  const leaderboardForTab = useMemo(() => {
    return leaderboardRows
      .filter((row) => row.category === leaderboardTab)
      .map((row) => ({
        ...row,
        scoreNum: Number(row.score ?? 0),
      }))
      .sort((a, b) => b.scoreNum - a.scoreNum)
      .slice(0, 150)
      .map((row, index) => ({
        ...row,
        derivedRank: index + 1,
      }));
  }, [leaderboardRows, leaderboardTab]);

  const detailRows = useMemo(() => {
    if (!selectedAthlete) return [];
    const maxHr = selectedAthlete.max_hr != null ? Number(selectedAthlete.max_hr) : null;
    const fallbackMaxHr = Math.max(1, 220 - Number(selectedAthlete.age ?? 30));
    const effectiveMaxHr = maxHr != null && Number.isFinite(maxHr) && maxHr > 0 ? maxHr : fallbackMaxHr;

    const workoutsRows = detailWorkouts.map((row) => {
      const duration = Number(row.duration_min ?? 0);
      const avgHr = row.avg_hr != null ? Number(row.avg_hr) : null;
      const hrPercent = avgHr != null && effectiveMaxHr > 0 ? (avgHr / effectiveMaxHr) * 100 : null;
      const pace = row.avg_pace_per_km != null ? Number(row.avg_pace_per_km) : null;
      const score = detailTab === 'engine' ? Number(row.engine_score ?? 0) : Number(row.run_score ?? 0);
      const scoring: ScoringOutcome = workoutScoringOutcome(detailTab, row, effectiveMaxHr);
      return {
        id: `workout-${row.id}`,
        source: 'Apple',
        date: row.started_at,
        activityType: row.activity_type ?? '—',
        duration: Number.isFinite(duration) ? Math.round(duration) : 0,
        avgHr,
        hrPercent,
        pace,
        score,
        scoring,
        workoutStatus: row.status ?? '—',
      };
    });

    const activitiesRows = detailActivities
      .filter((row) => (detailTab === 'engine' ? row.league_type !== 'run' : row.league_type === 'run'))
      .map((row) => {
        const duration = Number(row.duration_minutes ?? 0);
        const hrPercent = row.avg_hr_percent != null ? Number(row.avg_hr_percent) : null;
        const pace = row.avg_pace_seconds != null ? Number(row.avg_pace_seconds) : null;
        const score = activitySessionScore(detailTab, duration, hrPercent, pace);
        const derivedAvgHr = hrPercent != null ? Math.round((hrPercent / 100) * effectiveMaxHr) : null;
        const scoring = activityScoringOutcome(detailTab, row);
        return {
          id: `activity-${row.id}`,
          source: 'Terra/WHOOP',
          date: row.activity_date,
          activityType: row.activity_type ?? '—',
          duration: Number.isFinite(duration) ? Math.round(duration) : 0,
          avgHr: derivedAvgHr,
          hrPercent,
          pace,
          score,
          scoring,
          workoutStatus: row.status ?? '—',
        };
      });

    return [...workoutsRows, ...activitiesRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [detailActivities, detailTab, detailWorkouts, selectedAthlete]);

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const username = await resolveCurrentUsername();
    const allowlisted = isAllowlistedAdminUsername(username);

    if (password === ADMIN_PASSWORD && allowlisted) {
      setAdminPasswordSession();
      setAuthed(true);
      setAuthError(null);
      setPassword('');
      return;
    }

    if (password === ADMIN_PASSWORD && !allowlisted) {
      setAuthError('Correct password, but your RNKX username is not on the admin allowlist.');
      return;
    }

    setAuthError('Incorrect password');
  }

  if (!authed) {
    return (
      <AppShell headerActions={null}>
        <section className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-card p-5">
          <h1 className="type-section-label">Admin Access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Allowlisted accounts (e.g. sds8) can open admin automatically when signed in. Others need the admin
            password.
          </p>
          <form className="mt-4 space-y-3" onSubmit={handlePasswordSubmit}>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Admin password"
              autoComplete="current-password"
            />
            {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
            <Button type="submit" className="w-full">
              Unlock dashboard
            </Button>
          </form>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="type-section-label">Current season leaderboard</h2>
            <div className="inline-flex rounded-md border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => setLeaderboardTab('engine')}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  leaderboardTab === 'engine' ? 'bg-orange-500/20 text-orange-300' : 'text-muted-foreground'
                }`}
              >
                Engine
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardTab('run')}
                className={`rounded px-3 py-1 text-xs font-semibold ${
                  leaderboardTab === 'run' ? 'bg-cyan-500/20 text-cyan-300' : 'text-muted-foreground'
                }`}
              >
                Run
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-16 pb-2">Rank</th>
                  <th className="pb-2">Athlete</th>
                  <th className="w-32 pb-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardForTab.map((row) => (
                  <tr key={`${row.category}-${row.athlete_id}`} className="border-t border-border/60">
                    <td className="py-2">{row.derivedRank}</td>
                    <td className="truncate py-2">
                      {row.athletes?.username || row.athletes?.display_name || row.athlete_id.slice(0, 8)}
                    </td>
                    <td className="py-2 text-right">{formatScore(row.scoreNum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="type-section-label">Athletes</h2>
          {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading athletes...</p> : null}
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-[22%] pb-2 pr-2">Username</th>
                  <th className="w-[36%] pb-2 pr-3">Wearables</th>
                  <th className="w-[21%] pb-2 pl-2 text-right">Total score</th>
                  <th className="w-[21%] pb-2 pl-2 text-right">Last synced</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map((athlete) => (
                  <tr
                    key={athlete.id}
                    onClick={() => setSelectedAthleteId(athlete.id)}
                    className={`cursor-pointer border-t border-border/60 ${
                      athlete.id === selectedAthleteId ? 'bg-muted/30' : 'hover:bg-muted/20'
                    }`}
                  >
                    <td className="truncate py-2 pr-2">{athlete.username || athlete.display_name || athlete.id.slice(0, 8)}</td>
                    <td className="break-words py-2 pr-3 text-sm leading-snug">
                      {buildWearableDisplay(athlete, wearableSummaryByAthlete[athlete.id])}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">
                      {formatScore(Number(athlete.total_score ?? 0))}
                    </td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right">{dateOnly(athlete.last_synced)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedAthlete ? (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="type-section-label">
                  Athlete detail: {selectedAthlete.username || selectedAthlete.display_name || selectedAthlete.id}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Max HR: {selectedAthlete.max_hr != null ? selectedAthlete.max_hr : 'not set'}
                </p>
              </div>
              <div className="inline-flex rounded-md border border-border bg-background p-1">
                <button
                  type="button"
                  onClick={() => setDetailTab('engine')}
                  className={`rounded px-3 py-1 text-xs font-semibold ${
                    detailTab === 'engine' ? 'bg-orange-500/20 text-orange-300' : 'text-muted-foreground'
                  }`}
                >
                  Engine
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('run')}
                  className={`rounded px-3 py-1 text-xs font-semibold ${
                    detailTab === 'run' ? 'bg-cyan-500/20 text-cyan-300' : 'text-muted-foreground'
                  }`}
                >
                  Run
                </button>
              </div>
            </div>

            {detailLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading workouts...</p> : null}
            {detailError ? <p className="mt-3 text-sm text-destructive">{detailError}</p> : null}

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2">Source</th>
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Counted</th>
                    <th className="pb-2">Activity</th>
                    <th className="pb-2 text-right">Duration (min)</th>
                    {detailTab === 'engine' ? (
                      <>
                        <th className="pb-2 text-right">Avg HR</th>
                        <th className="pb-2 text-right">HR%</th>
                        <th className="pb-2 text-right">Engine score</th>
                      </>
                    ) : (
                      <>
                        <th className="pb-2 text-right">Pace sec/km</th>
                        <th className="pb-2 text-right">Pace</th>
                        <th className="pb-2 text-right">Run score</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row) => (
                    <tr key={row.id} className="border-t border-border/60">
                      <td className="py-2">{row.source}</td>
                      <td className="py-2 whitespace-nowrap">{dateOnly(row.date)}</td>
                      <td className="py-2">
                        <span
                          className={
                            row.scoring.counted
                              ? 'font-semibold text-neon-lime'
                              : 'font-medium text-muted-foreground'
                          }
                        >
                          {row.scoring.label}
                        </span>
                        {row.scoring.detail ? (
                          <p className="mt-0.5 max-w-[9rem] text-[11px] leading-snug text-muted-foreground">
                            {row.scoring.detail}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2">{row.activityType}</td>
                      <td className="py-2 text-right">{row.duration}</td>
                      {detailTab === 'engine' ? (
                        <>
                          <td className="py-2 text-right">{row.avgHr != null ? Math.round(row.avgHr) : '—'}</td>
                          <td className="py-2 text-right">
                            {row.hrPercent != null && Number.isFinite(row.hrPercent)
                              ? `${Math.round(row.hrPercent)}%`
                              : '—'}
                          </td>
                          <td className="py-2 text-right">{formatScore(row.score)}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 text-right">
                            {row.pace != null && Number.isFinite(row.pace) ? Math.round(row.pace) : '—'}
                          </td>
                          <td className="py-2 text-right">{paceDisplayFromSeconds(row.pace)}</td>
                          <td className="py-2 text-right">{formatScore(row.score)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

