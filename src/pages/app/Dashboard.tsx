import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app/AppShell';
import { MomentumBlock } from '@/components/dashboard/MomentumBlock';
import { SeasonCard } from '@/components/dashboard/SeasonCard';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { activitySessionScore } from '@/lib/activitySessionScore';
import { supabase } from '@/services/supabase';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<ActiveSeason | null>(null);
  const [stats, setStats] = useState<AthleteStats | null>(null);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);

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
        setLoading(false);
        return;
      }

      const { data: statsData, error: statsError } = await supabase
        .from('athlete_stats')
        .select(
          'engine_rank,run_rank,engine_score,run_score,total_score,engine_weekly_change,run_weekly_change,engine_places_to_promotion,run_places_to_promotion,engine_places_to_relegation,run_places_to_relegation,engine_division,run_division,selected_leagues'
        )
        .eq('athlete_id', userId)
        .maybeSingle();

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

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(loadDashboard);

  const daysRemaining = useMemo(() => {
    if (!season?.ends_at) return undefined;
    return Math.max(0, Math.ceil((new Date(season.ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  }, [season?.ends_at]);

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
