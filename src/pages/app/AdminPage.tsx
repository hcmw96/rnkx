import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AdminCompetitionPanel } from '@/components/admin/AdminCompetitionPanel';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { activitySessionScore } from '@/lib/activitySessionScore';
import { formatScore } from '@/lib/formatScore';
import {
  activityScoringOutcome,
  humanizeRejectReason,
  workoutScoringOutcome,
  type ScoringOutcome,
} from '@/lib/adminScoringOutcome';
import {
  clearAdminPasswordSession,
  formatAdminAccessDeniedMessage,
  isAllowlistedAdminCaller,
  prepareAdminAccess,
  resolveCurrentUsername,
  signInForAdminAccess,
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
  computed_score?: number | string | null;
};

type AthleteSeasonScores = {
  season_id: string | null;
  total_score: number;
  /** Season engine total (workout points + consistency bonuses). */
  engine_score: number;
  /** Season run total (workout points + consistency bonuses). */
  run_score: number;
  /** Breakdown only — already included in engine_score / run_score. */
  engine_consistency_bonus: number;
  run_consistency_bonus: number;
};

type RejectedFeedRow = {
  row_kind: 'workout' | 'activity';
  id: string;
  athlete_id: string;
  athlete_label: string;
  occurred_at: string;
  activity_type: string | null;
  duration_minutes: number | string | null;
  avg_hr: number | string | null;
  avg_hr_percent: number | string | null;
  pace_seconds: number | string | null;
  engine_score: number | string | null;
  run_score: number | string | null;
  league_type: string | null;
  computed_score: number | string | null;
  status: string | null;
  reject_reason: string | null;
};

type MergedActivityRow = {
  id: string;
  source: string;
  date: string;
  activityType: string;
  duration: number;
  avgHr: number | null;
  hrPercent: number | null;
  pace: number | null;
  engineScore: number;
  runScore: number;
  computedScore: number | null;
  leagueType: string | null;
  status: string;
  rejectReason: string | null;
  rejectionDetail: string;
  scoringEngine: ScoringOutcome;
  scoringRun: ScoringOutcome;
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

function activitySourceLabel(athlete: AthleteRow | null): string {
  const ds = (athlete?.data_source ?? '').toLowerCase();
  if (ds === 'apple') return 'Apple Watch';
  if (ds === 'terra') return 'Terra/WHOOP/Garmin';
  return 'Terra/WHOOP/Garmin';
}

function rejectedFeedReason(row: RejectedFeedRow): string {
  if (row.reject_reason) return humanizeRejectReason(row.reject_reason);
  const status = (row.status ?? '').toLowerCase();
  if (status === 'rejected') return 'Rejected';
  if (row.row_kind === 'activity') {
    const league = (row.league_type ?? 'engine').toLowerCase() === 'run' ? 'run' : 'engine';
    const outcome = activityScoringOutcome(league, {
      status: row.status,
      league_type: row.league_type,
      duration_minutes: row.duration_minutes,
      avg_hr_percent: row.avg_hr_percent,
      avg_pace_seconds: row.pace_seconds,
    });
    return outcome.detail ?? 'No qualifying score';
  }
  const engineOutcome = workoutScoringOutcome('engine', {
    status: row.status,
    reject_reason: row.reject_reason,
    duration_min: row.duration_minutes,
    avg_hr: row.avg_hr,
    avg_pace_per_km: row.pace_seconds,
    activity_type: row.activity_type,
    engine_score: row.engine_score,
    run_score: row.run_score,
  }, 190);
  if (engineOutcome.detail) return engineOutcome.detail;
  const runOutcome = workoutScoringOutcome('run', {
    status: row.status,
    reject_reason: row.reject_reason,
    duration_min: row.duration_minutes,
    avg_hr: row.avg_hr,
    avg_pace_per_km: row.pace_seconds,
    activity_type: row.activity_type,
    engine_score: row.engine_score,
    run_score: row.run_score,
  }, 190);
  return runOutcome.detail ?? 'No qualifying score';
}

function mergedRejectionDetail(row: MergedActivityRow): string {
  if (row.rejectReason) return humanizeRejectReason(row.rejectReason);
  if (row.status.toLowerCase() === 'rejected') return 'Rejected';
  if (row.scoringEngine.detail && row.scoringRun.detail) {
    if (row.scoringEngine.detail === row.scoringRun.detail) return row.scoringEngine.detail;
    return `Engine: ${row.scoringEngine.detail}; Run: ${row.scoringRun.detail}`;
  }
  return row.scoringEngine.detail ?? row.scoringRun.detail ?? '—';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState<string | null>(null);

  const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<LeagueTab>('engine');
  const [missingDivisions, setMissingDivisions] = useState<
    {
      athlete_id: string;
      username: string | null;
      display_name: string | null;
      league: string;
      season_id: string;
    }[]
  >([]);
  const [reconcileBusy, setReconcileBusy] = useState(false);

  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [athleteSearch, setAthleteSearch] = useState('');
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailWorkouts, setDetailWorkouts] = useState<WorkoutRow[]>([]);
  const [detailActivities, setDetailActivities] = useState<ActivityRow[]>([]);
  const [seasonScores, setSeasonScores] = useState<AthleteSeasonScores | null>(null);
  const [rejectedFeed, setRejectedFeed] = useState<RejectedFeedRow[]>([]);
  const [rejectedLoading, setRejectedLoading] = useState(false);
  const [rejectedError, setRejectedError] = useState<string | null>(null);
  const [wearableSummaryByAthlete, setWearableSummaryByAthlete] = useState<Record<string, ConnectionSummary>>({});

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setSignedInEmail(user?.email ?? null);
      if (user?.email) setEmail(user.email);

      const { ok, username, email: resolvedEmail, serverAllowed } = await prepareAdminAccess({
        fallbackEmail: user?.email,
      });
      setAuthed(ok);
      if (!ok && serverAllowed === false) {
        setAuthError(formatAdminAccessDeniedMessage(username, resolvedEmail));
      } else if (!ok && user) {
        setAuthError(
          `Could not verify admin access for ${resolvedEmail || user.email || 'your account'}. Try signing in again.`,
        );
      }
    })();
  }, []);

  const loadAdminDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: dashboardJson, error: dashboardErr } = await supabase.rpc('admin_get_dashboard');

    if (dashboardErr) {
      const msg = dashboardErr.message;
      if (/forbidden/i.test(msg)) {
        clearAdminPasswordSession();
        setAuthed(false);
        const username = await resolveCurrentUsername();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        setAuthError(
          isAllowlistedAdminCaller(username, authUser?.email ?? null)
            ? `Signed in but the server rejected admin access. Apply the latest Supabase migration (admin allowlist), sign out and back in, or contact support.`
            : 'Your account is not authorized for admin. Contact support if this is unexpected.',
        );
        setAthletes([]);
        setLeaderboardRows([]);
        setMissingDivisions([]);
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
      missing_divisions?: {
        athlete_id: string;
        username?: string | null;
        display_name?: string | null;
        league: string;
        season_id: string;
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
    setMissingDivisions(
      (payload.missing_divisions ?? []).map((row) => ({
        athlete_id: row.athlete_id,
        username: row.username ?? null,
        display_name: row.display_name ?? null,
        league: row.league,
        season_id: row.season_id,
      })),
    );

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
  }, []);

  useEffect(() => {
    if (!authed) return;
    void loadAdminDashboard();
  }, [authed, loadAdminDashboard]);

  async function handleReconcileOrphans() {
    const seasonId = missingDivisions[0]?.season_id;
    if (!seasonId) return;
    setReconcileBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_reconcile_athlete_divisions', {
      p_season_id: seasonId,
    });
    setReconcileBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    const rows = (data as { rows_upserted?: number } | null)?.rows_upserted;
    await loadAdminDashboard();
    setAdminNotice(`Reconciled ${rows ?? 0} division membership row(s).`);
  }

  useEffect(() => {
    if (!authed) return;
    void (async () => {
      setRejectedLoading(true);
      setRejectedError(null);
      const { data, error: rpcErr } = await supabase.rpc('admin_list_recent_rejected_activity', {
        p_limit: 50,
      });
      if (rpcErr) {
        setRejectedError(
          /forbidden/i.test(rpcErr.message)
            ? 'Forbidden — your account is not on the admin allowlist.'
            : rpcErr.message,
        );
        setRejectedFeed([]);
      } else {
        setRejectedFeed((data as RejectedFeedRow[] | null) ?? []);
      }
      setRejectedLoading(false);
    })();
  }, [authed]);

  useEffect(() => {
    if (!authed || !selectedAthleteId) {
      setDetailWorkouts([]);
      setDetailActivities([]);
      setSeasonScores(null);
      return;
    }
    void (async () => {
      setDetailLoading(true);
      setDetailError(null);
      const [activityRes, scoresRes] = await Promise.all([
        supabase.rpc('admin_list_athlete_recent_activity', {
          p_athlete_id: selectedAthleteId,
          p_limit: 250,
        }),
        supabase.rpc('admin_get_athlete_season_scores', {
          p_athlete_id: selectedAthleteId,
        }),
      ]);

      if (activityRes.error) {
        setDetailError(
          /forbidden/i.test(activityRes.error.message)
            ? 'Forbidden — your account is not on the admin allowlist.'
            : activityRes.error.message,
        );
        setDetailWorkouts([]);
        setDetailActivities([]);
      } else {
        const payload = (activityRes.data ?? {}) as {
          workouts?: WorkoutRow[] | null;
          activities?: ActivityRow[] | null;
        };
        setDetailWorkouts((payload.workouts as WorkoutRow[] | null) ?? []);
        setDetailActivities((payload.activities as ActivityRow[] | null) ?? []);
      }

      if (scoresRes.error) {
        setDetailError((prev) => prev ?? scoresRes.error?.message ?? null);
        setSeasonScores(null);
      } else {
        const scores = scoresRes.data as (AthleteSeasonScores & {
          consistency_bonus?: number;
        }) | null;
        setSeasonScores(
          scores
            ? {
                season_id: scores.season_id ?? null,
                total_score: Number(scores.total_score ?? 0),
                engine_score: Number(scores.engine_score ?? 0),
                run_score: Number(scores.run_score ?? 0),
                engine_consistency_bonus: Number(
                  scores.engine_consistency_bonus ?? scores.consistency_bonus ?? 0,
                ),
                run_consistency_bonus: Number(scores.run_consistency_bonus ?? 0),
              }
            : null,
        );
      }

      setDetailLoading(false);
    })();
  }, [authed, selectedAthleteId]);

  const selectedAthlete = useMemo(
    () => athletes.find((athlete) => athlete.id === selectedAthleteId) ?? null,
    [athletes, selectedAthleteId],
  );

  const searchMatches = useMemo(() => {
    const q = athleteSearch.trim().toLowerCase();
    if (!q) return [];
    return athletes
      .filter((a) => {
        const username = (a.username ?? '').toLowerCase();
        const display = (a.display_name ?? '').toLowerCase();
        return username.includes(q) || display.includes(q);
      })
      .slice(0, 12);
  }, [athleteSearch, athletes]);

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

  const mergedActivityRows = useMemo((): MergedActivityRow[] => {
    if (!selectedAthlete) return [];
    const maxHr = selectedAthlete.max_hr != null ? Number(selectedAthlete.max_hr) : null;
    const fallbackMaxHr = Math.max(1, 220 - Number(selectedAthlete.age ?? 30));
    const effectiveMaxHr = maxHr != null && Number.isFinite(maxHr) && maxHr > 0 ? maxHr : fallbackMaxHr;
    const terraSource = activitySourceLabel(selectedAthlete);

    const workoutRows: MergedActivityRow[] = detailWorkouts.map((row) => {
      const duration = Number(row.duration_min ?? 0);
      const avgHr = row.avg_hr != null ? Number(row.avg_hr) : null;
      const hrPercent = avgHr != null && effectiveMaxHr > 0 ? (avgHr / effectiveMaxHr) * 100 : null;
      const pace = row.avg_pace_per_km != null ? Number(row.avg_pace_per_km) : null;
      const scoringEngine = workoutScoringOutcome('engine', row, effectiveMaxHr);
      const scoringRun = workoutScoringOutcome('run', row, effectiveMaxHr);
      return {
        id: `workout-${row.id}`,
        source: 'Apple Watch',
        date: row.started_at,
        activityType: row.activity_type ?? '—',
        duration: Number.isFinite(duration) ? Math.round(duration) : 0,
        avgHr,
        hrPercent,
        pace,
        engineScore: Number(row.engine_score ?? 0),
        runScore: Number(row.run_score ?? 0),
        computedScore: null,
        leagueType: null,
        status: row.status ?? '—',
        rejectReason: row.reject_reason,
        rejectionDetail: '',
        scoringEngine,
        scoringRun,
      };
    });

    const activityRows: MergedActivityRow[] = detailActivities.map((row) => {
      const duration = Number(row.duration_minutes ?? 0);
      const hrPercent = row.avg_hr_percent != null ? Number(row.avg_hr_percent) : null;
      const pace = row.avg_pace_seconds != null ? Number(row.avg_pace_seconds) : null;
      const league = (row.league_type ?? 'engine').toLowerCase() === 'run' ? 'run' : 'engine';
      const computedScore = row.computed_score != null ? Number(row.computed_score) : activitySessionScore(league, duration, hrPercent, pace);
      const derivedAvgHr = hrPercent != null ? Math.round((hrPercent / 100) * effectiveMaxHr) : null;
      const scoringEngine = activityScoringOutcome('engine', row);
      const scoringRun = activityScoringOutcome('run', row);
      return {
        id: `activity-${row.id}`,
        source: terraSource,
        date: row.activity_date,
        activityType: row.activity_type ?? '—',
        duration: Number.isFinite(duration) ? Math.round(duration) : 0,
        avgHr: derivedAvgHr,
        hrPercent,
        pace,
        engineScore: league === 'engine' ? computedScore : 0,
        runScore: league === 'run' ? computedScore : 0,
        computedScore,
        leagueType: row.league_type,
        status: row.status ?? '—',
        rejectReason: null,
        rejectionDetail: '',
        scoringEngine,
        scoringRun,
      };
    });

    return [...workoutRows, ...activityRows]
      .map((row) => ({ ...row, rejectionDetail: mergedRejectionDetail(row) }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [detailActivities, detailWorkouts, selectedAthlete]);

  async function handleSignInSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);

    const result = await signInForAdminAccess(email, password);
    setAuthLoading(false);

    if (!result.ok) {
      setAuthError(result.error);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    setSignedInEmail(user?.email ?? null);
    setAuthed(true);
    setAuthError(null);
    setPassword('');
  }

  async function handleSignOut() {
    setAuthLoading(true);
    clearAdminPasswordSession();
    await supabase.auth.signOut();
    setAuthed(false);
    setSignedInEmail(null);
    setEmail('');
    setPassword('');
    setAuthError(null);
    setAuthLoading(false);
  }

  if (!authed) {
    return (
      <AppShell headerActions={null}>
        <section className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-card p-5">
          <h1 className="type-section-label">Admin Access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your RNKX email and password. Allowlisted accounts (e.g. @shaunsmith) can open the admin dashboard
            after sign-in.
          </p>
          {signedInEmail ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Currently signed in as <span className="text-foreground">{signedInEmail}</span>
            </p>
          ) : null}
          <form className="mt-4 space-y-3" onSubmit={handleSignInSubmit}>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              autoComplete="email"
              disabled={authLoading}
            />
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={authLoading}
            />
            {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
            <Button type="submit" className="w-full" disabled={authLoading}>
              {authLoading ? 'Signing in…' : 'Sign in to admin'}
            </Button>
            {signedInEmail ? (
              <Button type="button" variant="outline" className="w-full" disabled={authLoading} onClick={handleSignOut}>
                Sign out
              </Button>
            ) : null}
          </form>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="space-y-4">
        {missingDivisions.length > 0 ? (
          <div
            role="alert"
            className="rounded-lg border-2 border-destructive bg-destructive/15 p-4 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]"
          >
            <h2 className="type-section-label text-destructive">
              Orphan stats — missing division membership ({missingDivisions.length})
            </h2>
            <p className="mt-1 text-sm text-destructive/90">
              Athletes with <code className="text-xs">athlete_stats</code> but no{' '}
              <code className="text-xs">athlete_divisions</code> for this season. Promotion and the
              division board will treat them incorrectly until reconciled. Fix before any reset.
            </p>
            <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-sm font-medium text-foreground">
              {missingDivisions.map((row) => (
                <li key={`${row.athlete_id}-${row.league}`}>
                  {row.display_name || row.username || row.athlete_id} · {row.league}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="destructive"
              className="mt-4"
              disabled={reconcileBusy}
              onClick={() => void handleReconcileOrphans()}
            >
              {reconcileBusy ? 'Reconciling…' : 'Reconcile division membership for this season'}
            </Button>
          </div>
        ) : null}

        <AdminCompetitionPanel enabled={authed} />

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
          {adminNotice ? <p className="mt-3 text-sm text-neon-lime">{adminNotice}</p> : null}
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
                    onClick={() => {
                      setSelectedAthleteId(athlete.id);
                      setAthleteSearch(athlete.username || athlete.display_name || athlete.id.slice(0, 8));
                    }}
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

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="type-section-label">Athlete detail</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Search an athlete to inspect season scores and every synced workout — including rejected rows.
          </p>

          <div className="relative mt-3">
            <Input
              type="search"
              value={athleteSearch}
              onChange={(e) => setAthleteSearch(e.target.value)}
              placeholder="Search by username or display name…"
              className="bg-background"
            />
            {searchMatches.length > 0 ? (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
                {searchMatches.map((athlete) => (
                  <li key={athlete.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/30"
                      onClick={() => {
                        setSelectedAthleteId(athlete.id);
                        setAthleteSearch(athlete.username || athlete.display_name || athlete.id.slice(0, 8));
                      }}
                    >
                      <span>{athlete.username || athlete.display_name || athlete.id.slice(0, 8)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatScore(Number(athlete.total_score ?? 0))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {selectedAthlete ? (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="type-heading">
                    {selectedAthlete.username || selectedAthlete.display_name || selectedAthlete.id}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Max HR: {selectedAthlete.max_hr != null ? selectedAthlete.max_hr : 'not set'} · Wearables:{' '}
                    {buildWearableDisplay(selectedAthlete, wearableSummaryByAthlete[selectedAthlete.id])}
                  </p>
                </div>
              </div>

              {seasonScores ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">
                      {formatScore(seasonScores.total_score)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Engine</p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">
                      {formatScore(seasonScores.engine_score)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      of which consistency: {formatScore(seasonScores.engine_consistency_bonus)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Run</p>
                    <p className="mt-0.5 text-base font-semibold tabular-nums">
                      {formatScore(seasonScores.run_score)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      of which consistency: {formatScore(seasonScores.run_consistency_bonus)}
                    </p>
                  </div>
                </div>
              ) : null}

              {detailLoading ? <p className="text-sm text-muted-foreground">Loading activity…</p> : null}
              {detailError ? <p className="text-sm text-destructive">{detailError}</p> : null}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-2">Source</th>
                      <th className="pb-2 pr-2">Date</th>
                      <th className="pb-2 pr-2">Status</th>
                      <th className="pb-2 pr-2">Activity</th>
                      <th className="pb-2 pr-2 text-right">Min</th>
                      <th className="pb-2 pr-2 text-right">Avg HR</th>
                      <th className="pb-2 pr-2 text-right">HR%</th>
                      <th className="pb-2 pr-2 text-right">Pace</th>
                      <th className="pb-2 pr-2 text-right">Engine</th>
                      <th className="pb-2 pr-2 text-right">Run</th>
                      <th className="pb-2">Why not scored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedActivityRows.map((row) => {
                      const scored = row.scoringEngine.counted || row.scoringRun.counted;
                      return (
                        <tr key={row.id} className="border-t border-border/60 align-top">
                          <td className="py-2 pr-2 whitespace-nowrap">{row.source}</td>
                          <td className="py-2 pr-2 whitespace-nowrap">{dateOnly(row.date)}</td>
                          <td className="py-2 pr-2">
                            <span className={scored ? 'font-medium text-neon-lime' : 'text-muted-foreground'}>
                              {row.status}
                            </span>
                          </td>
                          <td className="py-2 pr-2">{row.activityType}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{row.duration}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {row.avgHr != null ? Math.round(row.avgHr) : '—'}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {row.hrPercent != null && Number.isFinite(row.hrPercent)
                              ? `${Math.round(row.hrPercent)}%`
                              : '—'}
                          </td>
                          <td className="py-2 pr-2 text-right whitespace-nowrap">
                            {paceDisplayFromSeconds(row.pace)}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">{formatScore(row.engineScore)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{formatScore(row.runScore)}</td>
                          <td className="py-2 max-w-[12rem] text-xs leading-snug text-muted-foreground">
                            {scored ? '—' : row.rejectionDetail}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Select an athlete from search or the table below.</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="type-section-label">Rejected workouts feed</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent failed or zero-score syncs across all athletes (last 50).
          </p>
          {rejectedLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading rejected feed…</p> : null}
          {rejectedError ? <p className="mt-3 text-sm text-destructive">{rejectedError}</p> : null}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-2">Athlete</th>
                  <th className="pb-2 pr-2">Source</th>
                  <th className="pb-2 pr-2">Date</th>
                  <th className="pb-2 pr-2">Activity</th>
                  <th className="pb-2 pr-2 text-right">Min</th>
                  <th className="pb-2 pr-2 text-right">HR / HR%</th>
                  <th className="pb-2 pr-2 text-right">Pace</th>
                  <th className="pb-2 pr-2 text-right">Score</th>
                  <th className="pb-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rejectedFeed.map((row) => {
                  const source = row.row_kind === 'workout' ? 'Apple Watch' : 'Terra/WHOOP/Garmin';
                  const score =
                    row.row_kind === 'workout'
                      ? Number(row.engine_score ?? 0) + Number(row.run_score ?? 0)
                      : Number(row.computed_score ?? 0);
                  const hrLabel =
                    row.row_kind === 'workout'
                      ? row.avg_hr != null
                        ? String(Math.round(Number(row.avg_hr)))
                        : '—'
                      : row.avg_hr_percent != null
                        ? `${Math.round(Number(row.avg_hr_percent))}%`
                        : '—';
                  return (
                    <tr key={`${row.row_kind}-${row.id}`} className="border-t border-border/60 align-top">
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          className="text-left text-neon-lime hover:underline"
                          onClick={() => {
                            setSelectedAthleteId(row.athlete_id);
                            setAthleteSearch(row.athlete_label);
                          }}
                        >
                          {row.athlete_label}
                        </button>
                      </td>
                      <td className="py-2 pr-2 whitespace-nowrap">{source}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">{dateOnly(row.occurred_at)}</td>
                      <td className="py-2 pr-2">{row.activity_type ?? '—'}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {Math.round(Number(row.duration_minutes ?? 0))}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{hrLabel}</td>
                      <td className="py-2 pr-2 text-right whitespace-nowrap">
                        {paceDisplayFromSeconds(
                          row.pace_seconds != null ? Number(row.pace_seconds) : null,
                        )}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatScore(score)}</td>
                      <td className="py-2 max-w-[12rem] text-xs leading-snug text-muted-foreground">
                        {rejectedFeedReason(row)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rejectedLoading && rejectedFeed.length === 0 && !rejectedError ? (
              <p className="mt-3 text-sm text-muted-foreground">No recent rejected or zero-score workouts.</p>
            ) : null}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

