import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Zap } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { MomentumBlock } from '@/components/dashboard/MomentumBlock';
import { SeasonCard } from '@/components/dashboard/SeasonCard';
import { PremiumGate } from '@/components/PremiumGate';
import { DashboardInsights } from '@/components/insights/DashboardInsights';
import { InsightsPreview } from '@/components/premium/PreviewMocks';
import type { InsightActivity } from '@/lib/insightsAggregates';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { activitySessionScore } from '@/lib/activitySessionScore';
import { isDespiaIphoneUa, wearablesIncludeAppleWatch } from '@/lib/despiaPlatform';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';

const SYNC_STALE_MS = 24 * 60 * 60 * 1000;

function isSyncStale(lastSynced: string | null | undefined): boolean {
  if (lastSynced == null || lastSynced === '') return true;
  const t = new Date(lastSynced).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > SYNC_STALE_MS;
}

interface ActiveSeason {
  id: string;
  name: string;
  ends_at: string | null;
}

interface AthleteStats {
  engine_rank: number | null;
  run_rank: number | null;
  engine_score: number | null;
  run_score: number | null;
  total_score: number | null;
  engine_weekly_change: number | null;
  run_weekly_change: number | null;
  engine_places_to_promotion: number | null;
  run_places_to_promotion: number | null;
  engine_places_to_relegation: number | null;
  run_places_to_relegation: number | null;
  engine_division: string | null;
  run_division: string | null;
  selected_leagues: string[] | null;
}

interface RecentActivity {
  id: string;
  activity_type: string | null;
  league_type: 'engine' | 'run' | string;
  activity_date: string;
  duration_minutes: number | null;
  avg_hr_percent: number | null;
  avg_pace_seconds: number | null;
  /** When set (workouts table), display this instead of recalculating via activitySessionScore. */
  sessionScore?: number;
}

interface WorkoutRow {
  id: string;
  activity_type: string | null;
  avg_hr: number | string | null;
  avg_pace_per_km: number | string | null;
  engine_score: number | string;
  run_score: number | string;
  duration_min: number | string;
  started_at: string;
}

function effectiveMaxHr(maxHr: number | string | null | undefined, age: number): number {
  const parsed =
    maxHr != null && maxHr !== ''
      ? typeof maxHr === 'number'
        ? maxHr
        : Number(maxHr)
      : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.max(1, 220 - age);
}

function mapWorkoutToRecentActivity(
  row: WorkoutRow,
  maxHr: number | string | null | undefined,
  age: number,
): RecentActivity {
  const maxHrValue = effectiveMaxHr(maxHr, age);
  const avgHr = row.avg_hr != null ? Number(row.avg_hr) : null;
  const avgHrPercent =
    avgHr != null && Number.isFinite(avgHr) && maxHrValue > 0 ? (avgHr / maxHrValue) * 100 : null;
  const engineScore = Number(row.engine_score) || 0;
  const runScore = Number(row.run_score) || 0;
  const started = new Date(row.started_at);
  const activityDate = Number.isFinite(started.getTime())
    ? started.toISOString().slice(0, 10)
    : String(row.started_at).slice(0, 10);

  return {
    id: `workout-${row.id}`,
    activity_type: row.activity_type,
    league_type: runScore > 0 ? 'run' : 'engine',
    activity_date: activityDate,
    duration_minutes: Number(row.duration_min) || 0,
    avg_hr_percent: avgHrPercent,
    avg_pace_seconds: row.avg_pace_per_km != null ? Number(row.avg_pace_per_km) : null,
    sessionScore: engineScore + runScore,
  };
}

function mergeRecentWorkouts(activities: RecentActivity[], workouts: RecentActivity[]): RecentActivity[] {
  return [...activities, ...workouts]
    .sort((a, b) => b.activity_date.localeCompare(a.activity_date))
    .slice(0, 10);
}

function activityLabel(activityType: string | null, leagueType: string): string {
  const value = String(activityType ?? '').toLowerCase();
  if (value.includes('run')) return 'Running';
  if (value.includes('strength')) return 'Strength';
  if (leagueType === 'run') return 'Running';
  return 'Engine';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<ActiveSeason | null>(null);
  const [stats, setStats] = useState<AthleteStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [insightActivities, setInsightActivities] = useState<InsightActivity[]>([]);
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [wearables, setWearables] = useState<string[] | null>(null);
  const [syncReminderDismissed, setSyncReminderDismissed] = useState(false);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

      const [{ data: userData, error: userError }, { data: seasonResult, error: seasonError }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from('seasons')
            .select('id,name,ends_at')
            .eq('is_active', true)
            .maybeSingle(),
        ]);

      if (seasonError) {
        setSeason(null);
        setError(seasonError.message);
        setLoading(false);
        return;
      }

      const activeSeasonId = (seasonResult?.id as string | undefined) ?? null;
      if (seasonResult != null) {
        setSeason(seasonResult as ActiveSeason);
      } else {
        setSeason(null);
      }

      if (userError) {
        setError(userError.message);
        setLoading(false);
        return;
      }

      const userId = userData.user?.id;
      if (!userId) {
        setLastSynced(null);
        setWearables(null);
        setLoading(false);
        return;
      }

      const [{ data: statsRows, error: statsError }, { data: athleteRow, error: athleteRowError }] =
        await Promise.all([
          activeSeasonId
            ? supabase
                .from('athlete_stats')
                .select('category,score,rank')
                .eq('athlete_id', userId)
                .eq('season_id', activeSeasonId)
                .in('category', ['engine', 'run'])
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('athletes')
            .select('last_synced, wearables, max_hr, age, selected_leagues')
            .eq('id', userId)
            .maybeSingle(),
        ]);

      if (athleteRowError) {
        setLastSynced(null);
        setWearables(null);
      } else {
        setLastSynced((athleteRow?.last_synced as string | null) ?? null);
        setWearables((athleteRow?.wearables as string[] | null) ?? null);
      }

      if (statsError) {
        setError(statsError.message);
      } else {
        const rows = (statsRows ?? []) as {
          category: string | null;
          score: number | string | null;
          rank: number | string | null;
        }[];

        let engineScore = 0;
        let runScore = 0;
        let engineRank: number | null = null;
        let runRank: number | null = null;

        for (const row of rows) {
          const pts = row.score != null ? Number(row.score) : 0;
          const r = row.rank != null ? Number(row.rank) : null;
          if (row.category === 'engine') {
            engineScore = Number.isFinite(pts) ? pts : 0;
            engineRank = r != null && Number.isFinite(r) && r > 0 ? Math.round(r) : null;
          } else if (row.category === 'run') {
            runScore = Number.isFinite(pts) ? pts : 0;
            runRank = r != null && Number.isFinite(r) && r > 0 ? Math.round(r) : null;
          }
        }

        setStats({
          engine_rank: engineRank,
          run_rank: runRank,
          engine_score: engineScore,
          run_score: runScore,
          total_score: engineScore + runScore,
          engine_weekly_change: null,
          run_weekly_change: null,
          engine_places_to_promotion: null,
          run_places_to_promotion: null,
          engine_places_to_relegation: null,
          run_places_to_relegation: null,
          engine_division: null,
          run_division: null,
          selected_leagues: (athleteRow?.selected_leagues as string[] | null | undefined) ?? null,
        });
      }

      const insightSince = new Date();
      insightSince.setDate(insightSince.getDate() - 35);
      const insightSinceIso = insightSince.toISOString().slice(0, 10);

      const athleteAge = Number(athleteRow?.age) || 30;
      const athleteMaxHr = (athleteRow?.max_hr as number | string | null | undefined) ?? null;

      const [
        { data: activityRows, error: activitiesError },
        { data: workoutRows, error: workoutsError },
        { data: insightRows, error: insightError },
      ] = await Promise.all([
        supabase
          .from('activities')
          .select('id,activity_type,league_type,activity_date,duration_minutes,avg_hr_percent,avg_pace_seconds')
          .eq('athlete_id', userId)
          .eq('status', 'scored')
          .order('workout_start_time', { ascending: false, nullsFirst: false })
          .order('activity_date', { ascending: false })
          .limit(10),
        supabase
          .from('workouts')
          .select(
            'id, activity_type, avg_hr, avg_pace_per_km, engine_score, run_score, duration_min, started_at',
          )
          .eq('athlete_id', userId)
          .eq('status', 'scored')
          .order('started_at', { ascending: false })
          .limit(10),
        supabase
          .from('activities')
          .select('id,activity_type,league_type,activity_date,duration_minutes,avg_hr_percent,avg_pace_seconds')
          .eq('athlete_id', userId)
          .eq('status', 'scored')
          .gte('activity_date', insightSinceIso)
          .order('activity_date', { ascending: true })
          .limit(120),
      ]);

      if (activitiesError) {
        setError((prev) => prev ?? activitiesError.message);
      }
      if (workoutsError) {
        setError((prev) => prev ?? workoutsError.message);
      }

      if (activitiesError && workoutsError) {
        setRecentActivities([]);
      } else {
        const fromActivities: RecentActivity[] = ((activityRows as RecentActivity[] | null) ?? []).map(
          (row) => ({ ...row, id: `activity-${row.id}` }),
        );
        const fromWorkouts = ((workoutRows as WorkoutRow[] | null) ?? []).map((row) =>
          mapWorkoutToRecentActivity(row, athleteMaxHr, athleteAge),
        );
        setRecentActivities(mergeRecentWorkouts(fromActivities, fromWorkouts));
      }

      if (insightError) {
        setInsightActivities([]);
      } else {
        setInsightActivities((insightRows as InsightActivity[] | null) ?? []);
      }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const refreshDashboard = useCallback(() => loadDashboard({ silent: true }), [loadDashboard]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      setAthleteId(uid);
    });
  }, []);

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(refreshDashboard);

  const daysRemaining = useMemo(() => {
    if (!season?.ends_at) return undefined;
    return Math.max(0, Math.ceil((new Date(season.ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  }, [season?.ends_at]);

  const showSyncReminderBanner = useMemo(() => {
    if (syncReminderDismissed) return false;
    if (!isDespiaIphoneUa()) return false;
    if (!wearablesIncludeAppleWatch(wearables)) return false;
    return isSyncStale(lastSynced);
  }, [syncReminderDismissed, lastSynced, wearables]);

  if (loading) {
    return (
      <AppShell>
        <section className="space-y-2">
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
          <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-28 animate-pulse rounded-lg bg-muted/30" />
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="space-y-4" {...pullHandlers}>
        {showSyncReminderBanner ? (
          <div
            className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2.5 text-amber-950 shadow-sm dark:border-amber-400/35 dark:bg-amber-400/12 dark:text-amber-50"
            role="status"
          >
            <Zap className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
            <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
              Sync your workouts to stay on the leaderboard
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0 border-amber-600/40 bg-amber-100/90 text-amber-950 hover:bg-amber-200/90 dark:border-amber-300/40 dark:bg-amber-500/25 dark:text-amber-50 dark:hover:bg-amber-500/35"
              onClick={() => navigate('/app/profile')}
            >
              Sync now
            </Button>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-amber-900/70 hover:bg-amber-500/25 hover:text-amber-950 dark:text-amber-100/80 dark:hover:bg-amber-400/20 dark:hover:text-amber-50"
              aria-label="Dismiss sync reminder"
              onClick={() => setSyncReminderDismissed(true)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {(isRefreshing || pullDistance > 0) && (
          <p className="text-center text-xs text-muted-foreground">
            {isRefreshing ? 'Refreshing dashboard...' : pullDistance > 72 ? 'Release to refresh' : 'Pull to refresh'}
          </p>
        )}
        {error && !/auth session missing/i.test(error) && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <SeasonCard
          seasonName={season == null ? 'No active season' : season.name}
          engineRank={stats?.engine_rank ?? null}
          runRank={stats?.run_rank ?? null}
          enginePoints={stats?.engine_score ?? 0}
          runPoints={stats?.run_score ?? 0}
          daysRemaining={daysRemaining}
          selectedLeagues={stats?.selected_leagues ?? []}
          engineDivision={(stats?.engine_division as 'Open' | 'Challenger' | 'Pro' | 'Elite' | null) ?? 'Open'}
          runDivision={(stats?.run_division as 'Open' | 'Challenger' | 'Pro' | 'Elite' | null) ?? 'Open'}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <MomentumBlock
            category="engine"
            weeklyChange={stats?.engine_weekly_change ?? 0}
            placesToPromotion={stats?.engine_places_to_promotion ?? null}
            placesToRelegation={stats?.engine_places_to_relegation ?? null}
            division={stats?.engine_division ?? 'Open'}
          />
          <MomentumBlock
            category="run"
            weeklyChange={stats?.run_weekly_change ?? 0}
            placesToPromotion={stats?.run_places_to_promotion ?? null}
            placesToRelegation={stats?.run_places_to_relegation ?? null}
            division={stats?.run_division ?? 'Open'}
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="type-section-label">Combined score</p>
          <p className="type-stat mt-1 text-foreground">
            {(stats?.total_score ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </p>
        </div>

        <PremiumGate
          athleteId={athleteId}
          userId={athleteId}
          badge="PREMIUM"
          title="Unlock Your Performance Story"
          description="Line charts for scoring momentum, volume, intensity, and coach-style insights from your workouts"
          previewContent={<InsightsPreview />}
        >
          <div className="rounded-xl border border-border/70 bg-[hsla(0,0%,10%,1)] p-4">
            <DashboardInsights activities={insightActivities} stats={stats} />
          </div>
        </PremiumGate>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="type-section-label">Recent workouts</h3>
          {!recentActivities.length ? (
            <p className="mt-3 text-sm text-muted-foreground">No scored workouts yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {recentActivities.map((activity) => {
                const leagueType = activity.league_type === 'run' ? 'run' : 'engine';
                const duration = Math.max(0, Number(activity.duration_minutes ?? 0));
                const score =
                  activity.sessionScore != null
                    ? activity.sessionScore
                    : activitySessionScore(
                        leagueType,
                        duration,
                        activity.avg_hr_percent != null ? Number(activity.avg_hr_percent) : null,
                        activity.avg_pace_seconds != null ? Number(activity.avg_pace_seconds) : null,
                      );
                return (
                  <div key={activity.id} className="flex items-center justify-between rounded-md border border-border/60 p-3">
                    <div className="min-w-0">
                      <p className="type-heading truncate">{activityLabel(activity.activity_type, leagueType)}</p>
                      <p className="type-meta mt-0.5">
                        {new Date(`${activity.activity_date}T12:00:00`).toLocaleDateString()} · {Math.round(duration)} min
                      </p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                          leagueType === 'run'
                            ? 'bg-cyan-500/15 text-cyan-300'
                            : 'bg-orange-500/15 text-orange-300'
                        }`}
                      >
                        {leagueType === 'run' ? 'Run' : 'Engine'}
                      </span>
                      <p className={cn('type-stat mt-1', leagueType === 'run' ? 'text-secondary' : 'text-primary')}>
                        {score.toLocaleString()}
                      </p>
                      <p className="type-stat-unit">pts</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
