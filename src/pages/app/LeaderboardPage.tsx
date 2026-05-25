import { useCallback, useEffect, useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { LeaderboardLeaguesPanel } from '@/components/leaderboard/LeaderboardLeaguesPanel';
import { LeaderboardRows } from '@/components/leaderboard/LeaderboardRows';
import { PremiumGate } from '@/components/PremiumGate';
import { FriendsPreview } from '@/components/premium/PreviewMocks';
import { Skeleton } from '@/components/ui/skeleton';
import { divisionForRank, isDivision, type Division } from '@/lib/division';
import { fetchAcceptedFriendIds } from '@/lib/friendships';
import { haptic } from '@/lib/haptics';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';

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

export default function LeaderboardPage() {
  const [activeLeague, setActiveLeague] = useState<League>('engine');
  const [scopeTab, setScopeTab] = useState<ScopeTab>('open');
  const [seasonName, setSeasonName] = useState<string | null>(null);
  const [merged, setMerged] = useState<MergedAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myAthleteId, setMyAthleteId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [myDivision, setMyDivision] = useState<Division>('Open');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [{ data: auth }, { data: seasonRow, error: seasonErr }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('seasons').select('id,name').eq('is_active', true).maybeSingle(),
    ]);

    const uid = auth.user?.id ?? null;
    setCurrentUserId(uid);

    if (!seasonErr && seasonRow?.name) {
      setSeasonName(String(seasonRow.name));
    } else {
      setSeasonName(null);
    }

    const seasonId = (seasonRow as { id?: string } | null)?.id ?? null;

    if (uid) {
      const aid = await resolveAthleteId(uid);
      setMyAthleteId(aid ?? null);
      if (aid) {
        const friends = await fetchAcceptedFriendIds(aid);
        setFriendIds(new Set(friends));
        const { data: myStats } = await supabase
          .from('athlete_stats')
          .select('engine_division, run_division, engine_rank, run_rank')
          .eq('athlete_id', aid)
          .maybeSingle();
        const divRaw =
          activeLeague === 'run'
            ? (myStats?.run_division as string | undefined)
            : (myStats?.engine_division as string | undefined);
        if (isDivision(divRaw)) {
          setMyDivision(divRaw);
        } else {
          const rankField =
            activeLeague === 'run' ? myStats?.run_rank : myStats?.engine_rank;
          if (rankField != null) setMyDivision(divisionForRank(Number(rankField)));
          else setMyDivision('Open');
        }
      } else {
        setFriendIds(new Set());
      }
    } else {
      setMyAthleteId(null);
      setFriendIds(new Set());
    }

    const pack = await fetchMergedLeaderboard(seasonId);
    if (pack.error) {
      setError(pack.error);
      setMerged([]);
    } else {
      setMerged(pack.merged);
    }

    setLoading(false);
  }, [activeLeague]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(loadAll);

  const rows = useMemo(() => {
    let base = buildRowsForLeague(merged, activeLeague);
    if (scopeTab === 'open') {
      base = base.filter((r) => divisionForRank(r.rank) === myDivision);
    }
    if (scopeTab === 'friends') {
      base = base
        .filter((r) => friendIds.has(r.id))
        .sort((a, b) => a.rank - b.rank)
        .map((r, i) => ({ ...r, rank: i + 1 }));
    }
    return base;
  }, [merged, activeLeague, scopeTab, myDivision, friendIds]);

  const seasonLabel = seasonShortLabel(seasonName);

  const scopeTabs: { id: ScopeTab; label: string }[] = [
    { id: 'open', label: 'Open' },
    { id: 'overall', label: 'Overall' },
    { id: 'friends', label: 'Friends' },
    { id: 'leagues', label: 'Leagues' },
  ];

  return (
    <AppShell>
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

        <p className="text-center text-xs text-muted-foreground">
          {scopeTab === 'open'
            ? `${myDivision} division · ${activeLeague === 'engine' ? 'Engine' : 'Run'}`
            : scopeTab === 'overall'
              ? `All divisions · ${activeLeague === 'engine' ? 'Engine' : 'Run'}`
              : scopeTab === 'friends'
                ? `Friends · ${activeLeague === 'engine' ? 'Engine' : 'Run'}`
                : seasonLabel}
        </p>

        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <LeaderboardSkeleton />
        ) : scopeTab === 'friends' ? (
          <PremiumGate
            athleteId={myAthleteId ?? undefined}
            userId={currentUserId ?? undefined}
            title="Friends leaderboard"
            description="Compare scores with athletes you've added as friends"
            previewContent={<FriendsPreview />}
          >
            {friendIds.size === 0 ? (
              <div className="rounded-xl border border-border bg-[hsla(0,0%,10%,1)] px-4 py-8 text-center">
                <p className="font-medium text-foreground">No friends yet</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add friends from Social → Friends to see them ranked here.
                </p>
              </div>
            ) : rows.length === 0 ? (
              <p className="rounded-xl border border-border bg-[hsla(0,0%,10%,1)] px-4 py-10 text-center text-sm text-muted-foreground">
                No scored friends in this league yet
              </p>
            ) : (
              <LeaderboardRows rows={rows} currentUserId={currentUserId} friendIds={friendIds} />
            )}
          </PremiumGate>
        ) : scopeTab === 'leagues' ? (
          <LeaderboardLeaguesPanel />
        ) : !error && rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-[hsla(0,0%,10%,1)] px-4 py-10 text-center text-sm text-muted-foreground">
            No athletes ranked yet
          </p>
        ) : (
          !error && <LeaderboardRows rows={rows} currentUserId={currentUserId} friendIds={friendIds} />
        )}

      </section>
    </AppShell>
  );
}
