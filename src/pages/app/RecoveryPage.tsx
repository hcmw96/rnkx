import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Check, Heart, Moon } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { AppHeaderActions } from '@/components/app/AppHeaderActions';
import { InsightsLineChart } from '@/components/insights/InsightsLineChart';
import { PremiumGate } from '@/components/PremiumGate';
import {
  buildInsightsSummary,
  type InsightActivity,
} from '@/lib/insightsAggregates';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';

type RecoveryPageProps = {
  embedded?: boolean;
};

const LIME = 'hsl(72 100% 50%)';
const CYAN = 'hsl(187 85% 53%)';

type Readiness = 'ready' | 'moderate' | 'rest';

function readinessFromSummary(summary: ReturnType<typeof buildInsightsSummary>): {
  status: Readiness;
  title: string;
  subtitle: string;
} {
  if (summary.weekSessions === 0) {
    return {
      status: 'moderate',
      title: 'Sync to unlock',
      subtitle: 'Connect Apple Watch or WHOOP to see recovery guidance.',
    };
  }
  if (summary.weekSessions >= 4 && summary.avgIntensity != null && summary.avgIntensity >= 75) {
    return {
      status: 'rest',
      title: 'High load week',
      subtitle: 'Consider an easy day — intensity has been elevated.',
    };
  }
  if (summary.weekDelta < 0 && summary.weekSessions >= 3) {
    return {
      status: 'moderate',
      title: 'Moderate recovery',
      subtitle: 'Volume dipped vs last week — steady sessions will rebuild momentum.',
    };
  }
  return {
    status: 'ready',
    title: 'Ready to Train',
    subtitle: 'Well-recovered — go for it!',
  };
}

export default function RecoveryPage({ embedded = false }: RecoveryPageProps) {
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  const [loadRange, setLoadRange] = useState<'today' | 'week'>('week');
  const [activities, setActivities] = useState<InsightActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setAthleteId(undefined);
      setAuthUserId(undefined);
      setActivities([]);
      setLoading(false);
      return;
    }
    setAuthUserId(uid);
    const [byUserId, byId] = await Promise.all([
      supabase.from('athletes').select('id').eq('user_id', uid).not('username', 'is', null).maybeSingle(),
      supabase.from('athletes').select('id').eq('id', uid).not('username', 'is', null).maybeSingle(),
    ]);
    const aid = (byUserId.data?.id ?? byId.data?.id) as string | undefined;
    setAthleteId(aid);

    const since = new Date();
    since.setDate(since.getDate() - 14);
    const { data: rows } = await supabase
      .from('activities')
      .select('id,activity_type,league_type,activity_date,duration_minutes,avg_hr_percent,avg_pace_seconds')
      .eq('athlete_id', uid)
      .eq('status', 'scored')
      .gte('activity_date', since.toISOString().slice(0, 10))
      .order('activity_date', { ascending: true })
      .limit(80);

    setActivities((rows as InsightActivity[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => buildInsightsSummary(activities, 14), [activities]);
  const readiness = useMemo(() => readinessFromSummary(summary), [summary]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayBucket = summary.daily.find((d) => d.date === todayKey);
  const weekMinutes = summary.daily.slice(-7).reduce((s, d) => s + d.minutes, 0);
  const weekSessions = summary.daily.slice(-7).reduce((s, d) => s + d.sessions, 0);

  const displayMinutes = loadRange === 'today' ? (todayBucket?.minutes ?? 0) : weekMinutes;
  const displaySessions = loadRange === 'today' ? (todayBucket?.sessions ?? 0) : weekSessions;
  const displayPts = loadRange === 'today' ? (todayBucket?.totalPts ?? 0) : summary.weekPts;

  const loadStatus =
    displayPts >= 400 ? 'High' : displayPts >= 150 ? 'Moderate' : displaySessions > 0 ? 'Light' : null;

  const trendData = summary.daily.map((d) => ({
    label: d.label,
    Points: Math.round(d.totalPts),
    Minutes: Math.round(d.minutes),
  }));

  const loadRecoveryPct =
    summary.weekSessions === 0
      ? null
      : Math.min(
          95,
          Math.max(
            15,
            Math.round(
              55 +
                (summary.weekDelta > 0 ? 12 : summary.weekDelta < 0 ? -15 : 0) -
                (summary.avgIntensity != null && summary.avgIntensity > 78 ? 18 : 0),
            ),
          ),
        );

  const inner = (
    <section className={cn('mx-auto max-w-lg space-y-4', embedded ? '' : 'pb-2')}>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading recovery insights…</p>
      ) : null}

      {/* Readiness */}
      <div
        className={cn(
          'rounded-xl border px-4 py-4',
          readiness.status === 'ready' && 'border-neon-lime/40 bg-[hsla(72,35%,12%,0.35)]',
          readiness.status === 'moderate' && 'border-amber-500/35 bg-amber-950/25',
          readiness.status === 'rest' && 'border-red-500/30 bg-red-950/20',
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              readiness.status === 'ready' && 'bg-neon-lime/15',
              readiness.status === 'moderate' && 'bg-amber-500/15',
              readiness.status === 'rest' && 'bg-red-500/15',
            )}
          >
            {readiness.status === 'ready' ? (
              <Check className="h-5 w-5 text-neon-lime" strokeWidth={2.5} />
            ) : readiness.status === 'rest' ? (
              <Moon className="h-5 w-5 text-red-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            )}
          </div>
          <div>
            <p
              className={cn(
                'font-sans text-lg font-semibold',
                readiness.status === 'ready' && 'text-neon-lime',
                readiness.status === 'moderate' && 'text-amber-400',
                readiness.status === 'rest' && 'text-red-400',
              )}
            >
              {readiness.title}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{readiness.subtitle}</p>
          </div>
        </div>
      </div>

      {/* RHR — placeholder until WHOOP recovery API */}
      <div className="rounded-xl border border-border/80 bg-[hsla(0,0%,10%,1)] px-4 py-4">
        <div className="flex items-center gap-3">
          <Heart className="h-6 w-6 shrink-0 text-red-500" strokeWidth={1.75} aria-hidden />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">RHR</p>
            <p className="text-sm text-foreground">
              Resting Heart Rate ·{' '}
              <span className="font-sans text-xl text-muted-foreground">
                {summary.avgIntensity != null ? Math.max(48, summary.avgIntensity - 35) : '--'}
              </span>{' '}
              <span className="text-sm text-muted-foreground">
                {summary.avgIntensity != null ? 'bpm est.' : 'bpm'}
              </span>
            </p>
            {summary.avgIntensity == null ? (
              <p className="text-[11px] text-muted-foreground">Connect WHOOP for live resting HR</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Activity load */}
      <div className="rounded-xl border border-border/80 bg-[hsla(0,0%,10%,1)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-sans text-base font-semibold text-foreground">Activity Load</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {loadRange === 'week'
                ? 'Your activity summary from the past week'
                : "Today's activity summary"}
            </p>
          </div>
          <div className="flex shrink-0 rounded-lg bg-muted/80 p-0.5 text-[10px] font-semibold">
            <button
              type="button"
              onClick={() => setLoadRange('today')}
              className={cn(
                'rounded-md px-2.5 py-1 transition-colors',
                loadRange === 'today' ? 'bg-muted text-foreground' : 'text-muted-foreground',
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setLoadRange('week')}
              className={cn(
                'rounded-md px-2.5 py-1 transition-colors',
                loadRange === 'week' ? 'bg-muted text-foreground' : 'text-muted-foreground',
              )}
            >
              7 Days
            </button>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt className="text-xs text-muted-foreground">Exercise Time</dt>
            <dd className="font-sans text-lg text-foreground tabular-nums">
              {displayMinutes > 0 ? displayMinutes : '--'} min
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Scored Points</dt>
            <dd className="font-sans text-lg text-foreground tabular-nums">
              {displayPts > 0 ? displayPts.toLocaleString() : '--'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Sessions</dt>
            <dd className="font-sans text-lg text-foreground tabular-nums">
              {displaySessions > 0 ? displaySessions : '--'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Load Status</dt>
            <dd>
              <span
                className={cn(
                  'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
                  loadStatus === 'High' && 'bg-red-500/15 text-red-400',
                  loadStatus === 'Moderate' && 'bg-amber-500/15 text-amber-400',
                  loadStatus === 'Light' && 'bg-neon-lime/15 text-neon-lime',
                  !loadStatus && 'bg-muted text-muted-foreground',
                )}
              >
                {loadStatus ?? '--'}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Activity trend — line chart */}
      <div className="rounded-xl border border-border/80 bg-[hsla(0,0%,10%,1)] p-4">
        <h2 className="font-sans text-base font-semibold text-foreground">Activity Trend</h2>
        <p className="text-[11px] text-muted-foreground">Daily scoring output</p>
        {summary.weekSessions > 0 ? (
          <InsightsLineChart
            className="mt-3"
            height={200}
            data={trendData}
            variant="area"
            valueSuffix=" pts"
            series={[{ dataKey: 'Points', label: 'Points', color: LIME, fillId: 'recoveryTrend' }]}
          />
        ) : (
          <InsightsLineChart
            className="mt-3 opacity-40"
            height={200}
            data={trendData}
            variant="area"
            series={[{ dataKey: 'Points', label: 'Points', color: LIME, fillId: 'recoveryTrendEmpty' }]}
          />
        )}
      </div>

      {/* Load vs recovery */}
      <div className="rounded-xl border border-border/80 bg-[hsla(0,0%,10%,1)] p-4 pb-5">
        <h2 className="font-sans text-base font-semibold text-foreground">Load vs Recovery</h2>
        <p className="text-[11px] text-muted-foreground">Derived from your recent training pattern</p>
        <div className="relative mt-5">
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-neon-lime via-neon-lime/80 to-secondary transition-all duration-500"
              style={{ width: `${loadRecoveryPct ?? 42}%` }}
              aria-hidden
            />
          </div>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-sans text-sm font-bold text-foreground tabular-nums">
            {loadRecoveryPct != null ? `${loadRecoveryPct}%` : '--'}
          </span>
        </div>
        <div className="mt-2 flex justify-between text-[11px] font-medium text-muted-foreground">
          <span>Recovery</span>
          <span>Load</span>
        </div>
        {summary.bestSession ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Latest peak: {summary.bestSession.label} (
            {format(parseISO(`${summary.bestSession.date}T12:00:00`), 'MMM d')}) —{' '}
            {summary.bestSession.score.toLocaleString()} pts
          </p>
        ) : null}
      </div>

      {/* Volume mini chart */}
      {summary.weekSessions > 0 ? (
        <div className="rounded-xl border border-border/80 bg-[hsla(0,0%,10%,1)] p-4">
          <h2 className="font-sans text-base font-semibold text-foreground">Weekly volume</h2>
          <p className="text-[11px] text-muted-foreground">Training minutes by day</p>
          <InsightsLineChart
            className="mt-3"
            height={160}
            data={trendData}
            variant="area"
            valueSuffix=" min"
            series={[{ dataKey: 'Minutes', label: 'Minutes', color: CYAN, fillId: 'recoveryVolume' }]}
          />
        </div>
      ) : null}

      {embedded ? (
        <p className="text-center text-xs text-muted-foreground">
          Connect Whoop or Apple Health from Profile for richer recovery metrics.
        </p>
      ) : null}
    </section>
  );

  if (embedded) return inner;

  return (
    <AppShell headerActions={<AppHeaderActions />}>
      <PremiumGate
        athleteId={athleteId}
        userId={authUserId}
        badge="PREMIUM"
        title="Recovery insights"
        description="Trend charts, load guidance, and readiness — included with RNKX Premium"
        previewContent={
          <div className="min-h-[280px] bg-zinc-950/90 p-4">
            <InsightsLineChart
              height={180}
              data={[
                { label: 'M', Points: 8 },
                { label: 'T', Points: 22 },
                { label: 'W', Points: 18 },
                { label: 'T', Points: 40 },
                { label: 'F', Points: 35 },
                { label: 'S', Points: 55 },
                { label: 'S', Points: 70 },
              ]}
              variant="area"
              series={[{ dataKey: 'Points', label: 'Points', color: LIME, fillId: 'recoveryPreview' }]}
            />
          </div>
        }
      >
        {inner}
      </PremiumGate>
    </AppShell>
  );
}
