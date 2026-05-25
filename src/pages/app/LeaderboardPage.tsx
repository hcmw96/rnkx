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

/** Display "Season 1" only — strip suffixes like " - Spring 2026" from DB season names. */
function seasonShortLabel(name: string | null | undefined): string {
  if (!name?.trim()) return 'Season 1';
  const trimmed = name.trim();
  const sep = trimmed.indexOf(' - ');
  return sep > 0 ? trimmed.slice(0, sep).trim() : trimmed;
}

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
    <ul className="space-y-1.5 px-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-[hsla(0,0%,10%,1)] px-2.5 py-2"
        >
          <Skeleton className="h-6 w-7 shrink-0 rounded bg-muted" />
          <Skeleton className="h-10 w-10 shrink-0 rounded-full bg-muted" />
          <Skeleton className="h-4 min-w-0 flex-1 rounded bg-muted" />
          <Skeleton className="h-8 w-12 shrink-0 rounded bg-muted" />
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

  const seasonLabel = seasonShortLabel(seasonName);

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
            <span className="font-semibold">{seasonLabel} is LIVE</span>
            <span className="text-neon-lime/85"> · Rankings update weekly</span>
          </p>
        </div>

        {/* Season title */}
        <div className="space-y-1 text-center">
          <h2 className="font-display text-2xl font-normal normal-case tracking-normal text-foreground">
            {seasonLabel}
          </h2>
          <p className="text-sm text-muted-foreground">{SEASON_TAGLINE}</p>
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
              'flex-1 rounded-lg px-4 py-3 font-sans text-sm font-semibold tracking-wide transition-colors',
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
              'flex-1 rounded-lg px-4 py-3 font-sans text-sm font-semibold tracking-wide transition-colors',
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
          <FakeDropdown label={seasonLabel} />
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
            <ul className="flex flex-col gap-1.5 px-0.5 pb-6">
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
                      'flex items-center gap-2.5 rounded-lg border bg-[hsla(0,0%,10%,1)] px-2.5 py-2 shadow-sm',
                      isSelf ? 'border-neon-lime/50 ring-1 ring-neon-lime/20' : 'border-border/70'
                    )}
                  >
                    <span
                      className={cn(
                        'w-8 shrink-0 text-center font-display text-xl font-bold tabular-nums leading-none',
                        isFirst ? 'text-neon-lime' : 'text-muted-foreground',
                      )}
                      aria-label={`Rank ${item.rank}`}
                    >
                      {item.rank}
                    </span>

                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border/80 bg-[hsla(0,0%,14%,1)]">
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center font-sans text-sm font-semibold text-muted-foreground">
                          {initial}
                        </span>
                      )}
                    </div>

                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {item.username}
                    </p>

                    {flag ? (
                      <span className="shrink-0 text-base leading-none" aria-hidden>
                        {flag}
                      </span>
                    ) : null}

                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                      <span
                        className={cn(
                          'font-display text-2xl font-bold leading-none tabular-nums',
                          isFirst ? 'text-neon-lime' : 'text-foreground',
                        )}
                      >
                        {pointsInt.toLocaleString()}
                      </span>
                      <span className="text-xs lowercase text-muted-foreground">pts</span>
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
