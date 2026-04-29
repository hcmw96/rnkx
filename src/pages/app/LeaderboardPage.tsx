import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app/AppShell';
import { LeagueToggle } from '@/components/leaderboard/LeagueToggle';
import { Skeleton } from '@/components/ui/skeleton';
import { getCountryByName } from '@/data/countries';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';

type League = 'engine' | 'run';

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

function rankClass(rank: number): string | undefined {
  if (rank === 1) return 'rank-gold font-bold';
  if (rank === 2) return 'rank-silver font-bold';
  if (rank === 3) return 'rank-bronze font-bold';
  return undefined;
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
    <ul className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-8 w-10 shrink-0" />
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-14 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/** PostgREST may show commas as %2C in request URLs; the client still sends plain comma-separated columns. */
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
  const statsMap = new Map<string, { engine_score: number; run_score: number; engine_rank: number | null; run_rank: number | null }>();

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

  return (
    <AppShell>
      <section className="space-y-4" {...pullHandlers}>
        {(isRefreshing || pullDistance > 0) && (
          <p className="text-center text-xs text-muted-foreground">
            {isRefreshing
              ? 'Refreshing leaderboard...'
              : pullDistance > 72
                ? 'Release to refresh'
                : 'Pull to refresh'}
          </p>
        )}
        <div className="space-y-1">
          <h2 className="font-display text-xl text-foreground">Leaderboard</h2>
          {seasonName ? (
            <p className="text-sm text-muted-foreground">{seasonName}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No active season</p>
          )}
        </div>

        <LeagueToggle activeLeague={activeLeague} onLeagueChange={setActiveLeague} />

        {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        {loading ? (
          <LeaderboardSkeleton />
        ) : !error && rows.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No athletes ranked yet
          </p>
        ) : (
          !error && (
            <ul className="space-y-2">
              {rows.map((item) => {
                const isSelf = currentUserId != null && item.id === currentUserId;
                const initial = (item.username || item.displayName || '?').trim().charAt(0).toUpperCase() || '?';
                const flag = item.country ? getCountryByName(item.country)?.flag ?? '' : '';

                return (
                  <li
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border bg-card p-3',
                      isSelf ? 'border-primary/60 ring-1 ring-primary/25' : 'border-border'
                    )}
                  >
                    <span
                      className={cn(
                        'w-9 shrink-0 text-center font-mono text-lg tabular-nums text-muted-foreground',
                        rankClass(item.rank)
                      )}
                    >
                      {item.rank}
                    </span>

                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt={item.username} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-foreground">
                          {initial}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{item.username}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {flag ? <span className="text-base leading-none">{flag}</span> : null}
                        {item.country ? <span className="truncate">{item.country}</span> : null}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {item.score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">pts</p>
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
