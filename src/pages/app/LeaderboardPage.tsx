import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { ChevronDown, Globe, Users, Zap } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { AppHeaderActions } from '@/components/app/AppHeaderActions';
import { LeaderboardLeaguesPanel } from '@/components/leaderboard/LeaderboardLeaguesPanel';
import { PremiumGate } from '@/components/PremiumGate';
import { FriendsPreview } from '@/components/premium/PreviewMocks';
import { Skeleton } from '@/components/ui/skeleton';
import { getCountryByName } from '@/data/countries';
import { haptic } from '@/lib/haptics';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';

type League = 'engine' | 'run';
type ScopeTab = 'open' | 'overall' | 'friends' | 'leagues';

/** Marketing subtitle under active season title (until DB exposes a subtitle field). */
const SEASON_TAGLINE = 'Spring Push';

interface LeaderboardViewRow {
  id: string;
  display_name: string;
  total_score: number | string;
  rank: number;
}

interface AthleteExtra {
  id: string;
  username: string | null;
  country: string | null;
  avatar_url: string | null;
}

interface AthleteStatExtra {
  athlete_id: string;
  season_id: string;
  category: 'engine' | 'run';
  score: number | string | null;
  rank: number | null;
}

interface MergedAthlete {
  id: string;
  display_name: string;
  total_score: number;
  username: string | null;
  country: string | null;
  avatar_url: string | null;
  engine_score: number;
  run_score: number;
  engine_rank: number | null;
  run_rank: number | null;
}

interface LeaderboardRow {
  id: string;
  rank: number;
  score: number;
  displayName: string;
  username: string;
  country: string | null;
  avatarUrl: string | null;
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v);
}

function buildRowsForLeague(merged: MergedAthlete[], league: League): LeaderboardRow[] {
  const allHaveLeagueRank =
    merged.length > 0 &&
    merged.every((m) => (league === 'engine' ? m.engine_rank != null : m.run_rank != null));

  if (allHaveLeagueRank) {
    return merged
      .map((m) => {
        const rank = league === 'engine' ? (m.engine_rank as number) : (m.run_rank as number);
        const score = league === 'engine' ? m.engine_score : m.run_score;
        const username = m.username || m.display_name || 'Athlete';
        return {
          id: m.id,
          rank,
          score,
          displayName: m.display_name,
          username,
          country: m.country,
          avatarUrl: m.avatar_url,
        };
      })
      .sort((a, b) => a.rank - b.rank);
  }

  return [...merged]
    .map((m) => ({
      id: m.id,
      score: league === 'engine' ? m.engine_score : m.run_score,
      displayName: m.display_name,
      username: m.username || m.display_name || 'Athlete',
      country: m.country,
      avatarUrl: m.avatar_url,
    }))
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({
      id: r.id,
      rank: i + 1,
      score: r.score,
      displayName: r.displayName,
      username: r.username,
      country: r.country,
      avatarUrl: r.avatarUrl,
    }));
}

function LeaderboardSkeleton() {
  return (
    <ul className="space-y-3 px-0.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border bg-[hsla(0,0%,10%,1)] px-3 py-3.5 sm:gap-4"
        >
          <Skeleton className="h-12 w-8 shrink-0 rounded-md bg-muted" />
          <Skeleton className="h-14 w-14 shrink-0 rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-36 rounded bg-muted" />
            <Skeleton className="h-3 w-24 rounded bg-muted" />
          </div>
          <Skeleton className="h-10 w-16 shrink-0 rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}

const LEADERBOARD_COLUMNS = 'id,display_name,total_score,rank';
const ATHLETE_ENRICH_COLUMNS = 'id,username,country,avatar_url';
const ATHLETE_STATS_COLUMNS = 'athlete_id,season_id,category,score,rank';

async function fetchMergedLeaderboard(
  activeSeasonId: string | null,
): Promise<{ merged: MergedAthlete[]; error: string | null }> {
  const lb = await supabase.from('leaderboard').select(LEADERBOARD_COLUMNS).order('rank', { ascending: true });

  if (lb.error) {
    return { merged: [], error: lb.error.message };
  }

  const base = (lb.data ?? []) as LeaderboardViewRow[];
  const ids = base.map((r) => r.id).filter(Boolean);

  const athleteMap = new Map<string, AthleteExtra>();
  const statsMap = new Map<
    string,
    { engine_score: number; run_score: number; engine_rank: number | null; run_rank: number | null }
  >();

  if (ids.length) {
    const [athRes, statRes] = await Promise.all([
      supabase.from('athletes').select(ATHLETE_ENRICH_COLUMNS).in('id', ids),
      activeSeasonId
        ? supabase
            .from('athlete_stats')
            .select(ATHLETE_STATS_COLUMNS)
            .eq('season_id', activeSeasonId)
            .in('athlete_id', ids)
            .in('category', ['engine', 'run'])
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (!athRes.error && athRes.data) {
      (athRes.data as AthleteExtra[]).forEach((a) => athleteMap.set(a.id, a));
    }
    if (!statRes.error && statRes.data) {
      (statRes.data as AthleteStatExtra[]).forEach((s) => {
        const existing = statsMap.get(s.athlete_id) ?? {
          engine_score: 0,
          run_score: 0,
          engine_rank: null,
          run_rank: null,
        };
        const score = num(s.score);
        if (s.category === 'engine') {
          existing.engine_score = score;
          existing.engine_rank = s.rank ?? null;
        } else if (s.category === 'run') {
          existing.run_score = score;
          existing.run_rank = s.rank ?? null;
        }
        statsMap.set(s.athlete_id, existing);
      });
    }
  }

  const merged: MergedAthlete[] = base.map((row) => {
    const a = athleteMap.get(row.id);
    const s = statsMap.get(row.id);
    const total = num(row.total_score);
    return {
      id: row.id,
      display_name: row.display_name,
      total_score: total,
      username: a?.username?.trim() || null,
      country: a?.country ?? null,
      avatar_url: a?.avatar_url ?? null,
      engine_score: s?.engine_score ?? 0,
      run_score: s?.run_score ?? 0,
      engine_rank: s?.engine_rank ?? null,
      run_rank: s?.run_rank ?? null,
    };
  });

  return { merged, error: null };
}

function FakeDropdown({
  icon: Icon,
  label,
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic('light');
        toast.message(`${label}`, { description: 'Filter options coming soon.' });
      }}
      className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-[hsla(0,0%,8%,1)] px-2 py-2.5 text-[11px] font-medium text-foreground shadow-sm sm:flex-initial sm:min-w-0 sm:px-3 sm:text-xs"
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <span className="truncate">{label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

export default function LeaderboardPage() {
  const [activeLeague, setActiveLeague] = useState<League>('engine');
  const [scopeTab, setScopeTab] = useState<ScopeTab>('open');
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [merged, setMerged] = useState<MergedAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [{ data: auth }, { data: seasonRow, error: seasonErr }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('seasons').select('id,name').eq('is_active', true).maybeSingle(),
    ]);

    setCurrentUserId(auth.user?.id ?? null);

    if (!seasonErr && seasonRow?.name) {
      setSeasonName(String(seasonRow.name));
    } else {
      setSeasonName(null);
    }

    const pack = await fetchMergedLeaderboard((seasonRow as { id?: string } | null)?.id ?? null);
    if (pack.error) {
      setError(pack.error);
      setMerged([]);
    } else {
      setMerged(pack.merged);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(loadAll);

  const rows = useMemo(() => buildRowsForLeague(merged, activeLeague), [merged, activeLeague]);

  const bannerSeasonLabel = seasonName ?? 'Season 1';

  const scopeTabs: { id: ScopeTab; label: string }[] = [
    { id: 'open', label: 'Open' },
    { id: 'overall', label: 'Overall' },
    { id: 'friends', label: 'Friends' },
    { id: 'leagues', label: 'Leagues' },
  ];

  return (
    <AppShell headerActions={<AppHeaderActions />}>
      <section className="mx-auto flex max-w-lg flex-col gap-5 pb-2" {...pullHandlers}>
        {(isRefreshing || pullDistance > 0) && (
          <p className="text-center text-xs text-muted-foreground">
            {isRefreshing ? 'Refreshing…' : pullDistance > 72 ? 'Release to refresh' : ''}
          </p>
        )}

        {/* Status banner */}
        <div className="flex items-center gap-2 rounded-xl border border-neon-lime/35 bg-[hsla(72,35%,12%,0.45)] px-3.5 py-2.5">
          <Zap className="h-4 w-4 shrink-0 text-neon-lime" aria-hidden />
          <p className="text-[13px] font-medium leading-snug text-neon-lime">
            <span className="font-semibold">{bannerSeasonLabel} is LIVE</span>
            <span className="text-neon-lime/85"> · Rankings update weekly</span>
          </p>
        </div>

        {/* Season title */}
        <div className="space-y-0.5">
          <h2 className="font-display text-3xl uppercase tracking-[0.04em] text-foreground md:text-[2rem]">
            {bannerSeasonLabel}
          </h2>
          <p className="text-[15px] text-muted-foreground">{SEASON_TAGLINE}</p>
        </div>

        {/* ENGINE | RUN segmented control */}
        <div className="flex rounded-xl bg-muted/90 p-1">
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setActiveLeague('engine');
            }}
            className={cn(
              'flex-1 rounded-lg px-4 py-3 font-display text-sm font-bold uppercase tracking-wide transition-colors',
              activeLeague === 'engine'
                ? 'bg-neon-lime text-black shadow-sm'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            ENGINE
          </button>
          <button
            type="button"
            onClick={() => {
              haptic('light');
              setActiveLeague('run');
            }}
            className={cn(
              'flex-1 rounded-lg px-4 py-3 font-display text-sm font-bold uppercase tracking-wide transition-colors',
              activeLeague === 'run'
                ? 'bg-neon-lime text-black shadow-sm'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            RUN
          </button>
        </div>

        {/* Secondary scope tabs */}
        <div className="rounded-xl border border-border/60 bg-[hsla(0,0%,10%,1)] p-1">
          <div className="grid grid-cols-4 gap-0.5">
            {scopeTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  haptic('light');
                  setScopeTab(t.id);
                }}
                className={cn(
                  'rounded-lg py-2.5 text-center text-[11px] font-semibold transition-colors sm:text-xs',
                  scopeTab === t.id
                    ? t.id === 'leagues'
                      ? 'border border-neon-lime/70 bg-muted/80 text-foreground shadow-sm'
                      : 'bg-muted text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground/90',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter row */}
        <div className="flex gap-2">
          <FakeDropdown label={seasonName ?? 'Season 1'} />
          <FakeDropdown icon={Globe} label="All" />
          <FakeDropdown icon={Users} label="All" />
        </div>

        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <LeaderboardSkeleton />
        ) : scopeTab === 'friends' ? (
          <PremiumGate
            athleteId={currentUserId ?? undefined}
            userId={currentUserId ?? undefined}
            title="Friends leaderboard"
            description="Invite friends from Social → Friends"
            previewContent={<FriendsPreview />}
          >
            <div className="rounded-xl border border-border bg-[hsla(0,0%,10%,1)] px-4 py-8 text-center">
              <p className="font-medium text-foreground">Friends leaderboard</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Compare scores with people you&apos;ve added. Open Social → Friends to get started.
              </p>
            </div>
          </PremiumGate>
        ) : scopeTab === 'leagues' ? (
          <LeaderboardLeaguesPanel />
        ) : !error && rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-[hsla(0,0%,10%,1)] px-4 py-10 text-center text-sm text-muted-foreground">
            No athletes ranked yet
          </p>
        ) : (
          !error && (
            <ul className="flex flex-col gap-2.5 px-0.5 pb-6">
              {rows.map((item) => {
                const isSelf = currentUserId != null && item.id === currentUserId;
                const initial = (item.username || item.displayName || '?').trim().charAt(0).toUpperCase() || '?';
                const flag = item.country ? (getCountryByName(item.country)?.flag ?? '') : '';
                const isFirst = item.rank === 1;
                const pointsInt = Number.isFinite(item.score) ? Math.round(item.score) : 0;

                return (
                  <li
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border bg-[hsla(0,0%,10%,1)] px-3 py-3.5 shadow-sm sm:gap-4',
                      isSelf ? 'border-neon-lime/50 ring-1 ring-neon-lime/20' : 'border-border/70'
                    )}
                  >
                    <span
                      className={cn(
                        'flex w-8 shrink-0 justify-center tabular-nums leading-none sm:w-11',
                        isFirst
                          ? 'font-display text-4xl font-bold text-neon-lime sm:text-[2.75rem]'
                          : 'font-display text-[1.85rem] font-bold text-muted-foreground sm:text-4xl'
                      )}
                      aria-label={`Rank ${item.rank}`}
                    >
                      {item.rank}
                    </span>

                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-border/80 bg-[hsla(0,0%,14%,1)]">
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-muted-foreground">
                          {initial}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-foreground">{item.username}</p>
                      <div className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                        {flag ? <span className="text-[15px] leading-none">{flag}</span> : null}
                        {item.country ? <span className="truncate">{item.country}</span> : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                      <span className="font-display text-[1.85rem] font-bold leading-none text-neon-lime tabular-nums sm:text-[2rem]">
                        {pointsInt.toLocaleString()}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        pts
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}

      </section>
    </AppShell>
  );
}
