import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Zap } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { MomentumBlock } from '@/components/dashboard/MomentumBlock';
import { SeasonCard } from '@/components/dashboard/SeasonCard';
import { PremiumGate } from '@/components/PremiumGate';
import { InsightsPreview } from '@/components/premium/PreviewMocks';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { activitySessionScore } from '@/lib/activitySessionScore';
import { isDespiaIphoneUa, wearablesIncludeAppleWatch } from '@/lib/despiaPlatform';
import { supabase } from '@/services/supabase';

const SYNC_STALE_MS = 24 * 60 * 60 * 1000;

function isSyncStale(lastSynced: string | null | undefined): boolean {
  if (lastSynced == null || lastSynced === '') return true;
  const t = new Date(lastSynced).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > SYNC_STALE_MS;
}

interface ActiveSeason {
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
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [wearables, setWearables] = useState<string[] | null>(null);
  const [syncReminderDismissed, setSyncReminderDismissed] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

      const [{ data: userData, error: userError }, { data: seasonResult, error: seasonError }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase
            .from('seasons')
            .select('name,ends_at')
            .eq('is_active', true)
            .maybeSingle(),
        ]);

      if (seasonError) {
        setSeason(null);
        setError(seasonError.message);
        setLoading(false);
        return;
      }

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

      const [{ data: statsData, error: statsError }, { data: athleteRow, error: athleteRowError }] =
        await Promise.all([
          supabase
            .from('athlete_stats')
            .select(
              'engine_rank,run_rank,engine_score,run_score,total_score,engine_weekly_change,run_weekly_change,engine_places_to_promotion,run_places_to_promotion,engine_places_to_relegation,run_places_to_relegation,engine_division,run_division,selected_leagues'
            )
            .eq('athlete_id', userId)
            .maybeSingle(),
          supabase.from('athletes').select('last_synced, wearables').eq('id', userId).maybeSingle(),
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
        setStats((statsData as AthleteStats | null) ?? null);
      }

      const { data: activityRows, error: activitiesError } = await supabase
        .from('activities')
        .select('id,activity_type,league_type,activity_date,duration_minutes,avg_hr_percent,avg_pace_seconds')
        .eq('athlete_id', userId)
        .eq('status', 'scored')
        .order('workout_start_time', { ascending: false, nullsFirst: false })
        .order('activity_date', { ascending: false })
        .limit(10);

      if (activitiesError) {
        setError((prev) => prev ?? activitiesError.message);
        setRecentActivities([]);
      } else {
        setRecentActivities((activityRows as RecentActivity[] | null) ?? []);
      }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      setAthleteId(uid);
    });
  }, []);

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(loadDashboard);

  const insightsTopSessions = useMemo(() => {
    const scored = recentActivities.map((activity) => {
      const leagueType = activity.league_type === 'run' ? 'run' : 'engine';
      const duration = Math.max(0, Number(activity.duration_minutes ?? 0));
      const score = activitySessionScore(
        leagueType,
        duration,
        activity.avg_hr_percent != null ? Number(activity.avg_hr_percent) : null,
        activity.avg_pace_seconds != null ? Number(activity.avg_pace_seconds) : null,
      );
      return { activity, leagueType, score };
    });
    return [...scored].sort((a, b) => b.score - a.score).slice(0, 3);
  }, [recentActivities]);

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
          <p className="text-sm text-muted-foreground">Combined score</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {(stats?.total_score ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </p>
        </div>

        <PremiumGate
          athleteId={athleteId}
          userId={athleteId}
          badge="PREMIUM"
          title="Unlock Your Performance Story"
          description="See your rank trajectory, session breakdowns, and biggest gains"
          previewContent={<InsightsPreview />}
        >
          <div className="space-y-5 rounded-lg border border-border bg-card p-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Insights</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Snapshot of how you&apos;re trending this season.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/25 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rank trajectory</p>
              <div className="mt-3 flex flex-wrap gap-4">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Engine</p>
                  <p className="text-lg font-semibold text-foreground">
                    #{stats?.engine_rank != null ? stats.engine_rank.toLocaleString() : '—'}
                  </p>
                  {stats?.engine_weekly_change != null ? (
                    <p
                      className={`text-xs font-medium ${stats.engine_weekly_change >= 0 ? 'text-emerald-400' : 'text-amber-500/90'}`}
                    >
                      {stats.engine_weekly_change >= 0 ? '+' : ''}
                      {stats.engine_weekly_change} vs last week
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Run</p>
                  <p className="text-lg font-semibold text-foreground">
                    #{stats?.run_rank != null ? stats.run_rank.toLocaleString() : '—'}
                  </p>
                  {stats?.run_weekly_change != null ? (
                    <p
                      className={`text-xs font-medium ${stats.run_weekly_change >= 0 ? 'text-emerald-400' : 'text-amber-500/90'}`}
                    >
                      {stats.run_weekly_change >= 0 ? '+' : ''}
                      {stats.run_weekly_change} vs last week
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Session breakdowns</p>
              {!insightsTopSessions.length ? (
                <p className="mt-2 text-sm text-muted-foreground">No scored workouts yet — log a session to see breakdowns.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {insightsTopSessions.map(({ activity, leagueType, score }) => (
                    <li
                      key={activity.id}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {activityLabel(activity.activity_type, leagueType)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(`${activity.activity_date}T12:00:00`).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="ml-2 shrink-0 text-sm font-semibold text-neon-lime">
                        {score.toLocaleString()} pts
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-300/90">Biggest gains</p>
              <p className="mt-2 text-sm text-foreground">
                Stay consistent with weekly volume — your momentum scores track promotion pressure in each league.
              </p>
            </div>
          </div>
        </PremiumGate>

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent workouts</h3>
          {!recentActivities.length ? (
            <p className="mt-3 text-sm text-muted-foreground">No scored workouts yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {recentActivities.map((activity) => {
                const leagueType = activity.league_type === 'run' ? 'run' : 'engine';
                const duration = Math.max(0, Number(activity.duration_minutes ?? 0));
                const score = activitySessionScore(
                  leagueType,
                  duration,
                  activity.avg_hr_percent != null ? Number(activity.avg_hr_percent) : null,
                  activity.avg_pace_seconds != null ? Number(activity.avg_pace_seconds) : null,
                );
                return (
                  <div key={activity.id} className="flex items-center justify-between rounded-md border border-border/60 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {activityLabel(activity.activity_type, leagueType)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(`${activity.activity_date}T12:00:00`).toLocaleDateString()} · {duration} min
                      </p>
                    </div>
                    <div className="ml-3 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          leagueType === 'run'
                            ? 'bg-cyan-500/15 text-cyan-300'
                            : 'bg-orange-500/15 text-orange-300'
                        }`}
                      >
                        {leagueType === 'run' ? 'Run' : 'Engine'}
                      </span>
                      <p className="mt-1 text-sm font-semibold text-foreground">{score.toLocaleString()} pts</p>
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
