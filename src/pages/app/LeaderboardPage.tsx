import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Globe, Users, Zap } from 'lucide-react';
import { LeaderboardRows } from '@/components/leaderboard/LeaderboardRows';
import { PremiumGate } from '@/components/PremiumGate';
import { FriendsPreview } from '@/components/premium/PreviewMocks';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchMyDivisions, type League } from '@/lib/athleteDivisions';
import { isDivision, type Division } from '@/lib/division';
import { fetchAcceptedFriendIds } from '@/lib/friendships';
import { isHiddenFromLeaderboard } from '@/lib/leaderboardHidden';
import { haptic } from '@/lib/haptics';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { setLeaderboardCache } from '@/lib/routeCaches';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';

type ScopeTab = 'open' | 'overall' | 'friends';
type GenderFilter = 'all' | 'male' | 'female';

interface SeasonOption {
  id: string;
  name: string;
  is_active: boolean;
}

const GENDER_OPTIONS: { value: GenderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

function normalizeGender(value: string | null | undefined): 'male' | 'female' | null {
  const g = value?.trim().toLowerCase();
  if (g === 'male' || g === 'm') return 'male';
  if (g === 'female' || g === 'f') return 'female';
  return null;
}

/** Display "Season 1" only — strip suffixes like " - Spring 2026" from DB season names. */
function seasonShortLabel(name: string | null | undefined): string {
  if (!name?.trim()) return 'Season 1';
  const trimmed = name.trim();
  const sep = trimmed.indexOf(' - ');
  return sep > 0 ? trimmed.slice(0, sep).trim() : trimmed;
}

function seasonSubtitle(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const sep = name.trim().indexOf(' - ');
  if (sep < 0) return null;
  const subtitle = name.trim().slice(sep + 3).trim();
  return subtitle || null;
}

interface SeasonBoardRow {
  id: string;
  display_name: string;
  season_score: number | string;
  rank: number;
  division: string;
  league: string;
  recorded_at: string | null;
}

interface AthleteExtra {
  id: string;
  username: string | null;
  country: string | null;
  avatar_url: string | null;
  gender: string | null;
}

interface MergedAthlete {
  id: string;
  display_name: string;
  season_score: number;
  rank: number;
  division: Division;
  username: string | null;
  country: string | null;
  avatar_url: string | null;
  gender: 'male' | 'female' | null;
  recorded_at: string | null;
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

type BoardRequest = {
  league: League;
  seasonId: string | null;
  scopeTab: ScopeTab;
};

function isSameBoardRequest(a: BoardRequest, b: BoardRequest): boolean {
  return a.league === b.league && a.seasonId === b.seasonId && a.scopeTab === b.scopeTab;
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v);
}

/** Re-assign ranks after client filters; same tie-break as the SQL views. */
function reRankBySeasonTieBreak(
  rows: LeaderboardRow[],
  recordedAtById: Map<string, string | null>,
): LeaderboardRow[] {
  return [...rows]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = recordedAtById.get(a.id) ?? '';
      const tb = recordedAtById.get(b.id) ?? '';
      if (ta !== tb) return ta.localeCompare(tb);
      return a.id.localeCompare(b.id);
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function LeaderboardFilterSelect({
  icon: Icon,
  value,
  onValueChange,
  options,
  'aria-label': ariaLabel,
}: {
  icon?: ComponentType<{ className?: string }>;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  'aria-label': string;
}) {
  const label = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '';

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          'flex h-auto flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-[hsla(0,0%,8%,1)] px-2 py-2.5 text-xs font-medium text-foreground shadow-sm sm:flex-initial sm:min-w-0 sm:px-3',
          'focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0',
          'data-[state=open]:border-neon-lime/70 data-[state=open]:ring-1 data-[state=open]:ring-neon-lime/25',
          'data-[state=closed]:focus-visible:border-neon-lime/70 data-[state=closed]:focus-visible:ring-1 data-[state=closed]:focus-visible:ring-neon-lime/25',
          '[&>svg:last-child]:h-3.5 [&>svg:last-child]:w-3.5 [&>svg:last-child]:opacity-60',
        )}
      >
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
        <span className="truncate">{label}</span>
      </SelectTrigger>
      <SelectContent className="max-h-64 border-border bg-[hsla(0,0%,8%,1)]">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs sm:text-sm">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LeaderboardSkeleton() {
  return (
    <ul className="space-y-1.5 px-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-2 rounded-lg border border-border bg-[hsla(0,0%,10%,1)] px-2.5 py-2"
        >
          <Skeleton className="h-5 w-7 shrink-0 rounded bg-muted" />
          <Skeleton className="h-9 w-9 shrink-0 rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24 rounded bg-muted" />
            <Skeleton className="h-3 w-32 rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

const SEASON_BOARD_COLUMNS = 'id,display_name,season_score,rank,division,league,recorded_at';
const ATHLETE_ENRICH_COLUMNS = 'id,username,country,avatar_url,gender';
const BOARD_PAGE_SIZE = 100;

async function fetchSeasonBoard(
  view: 'season_division_leaderboard' | 'season_overall_leaderboard',
  seasonId: string,
  league: League,
  division?: Division | null,
  offset = 0,
): Promise<{ merged: MergedAthlete[]; error: string | null }> {
  let q = supabase
    .from(view)
    .select(SEASON_BOARD_COLUMNS)
    .eq('season_id', seasonId)
    .eq('league', league)
    .order('rank', { ascending: true })
    .range(offset, offset + BOARD_PAGE_SIZE - 1);

  if (view === 'season_division_leaderboard' && division) {
    q = q.eq('division', division);
  }

  const board = await q;
  if (board.error) {
    return { merged: [], error: board.error.message };
  }

  const base = (board.data ?? []) as SeasonBoardRow[];
  const ids = base.map((r) => r.id).filter(Boolean);
  const athleteMap = new Map<string, AthleteExtra>();

  if (ids.length) {
    const athRes = await supabase.from('athletes').select(ATHLETE_ENRICH_COLUMNS).in('id', ids);
    if (!athRes.error && athRes.data) {
      (athRes.data as AthleteExtra[]).forEach((a) => athleteMap.set(a.id, a));
    }
  }

  const merged: MergedAthlete[] = base.map((row) => {
    const a = athleteMap.get(row.id);
    const divisionValue = isDivision(row.division) ? row.division : 'Open';
    return {
      id: row.id,
      display_name: row.display_name,
      season_score: num(row.season_score),
      rank: num(row.rank),
      division: divisionValue,
      username: a?.username?.trim() || null,
      country: a?.country ?? null,
      avatar_url: a?.avatar_url ?? null,
      gender: normalizeGender(a?.gender),
      recorded_at: row.recorded_at ?? null,
    };
  });

  return { merged, error: null };
}

export default function LeaderboardPage() {
  const [activeLeague, setActiveLeague] = useState<League>('engine');
  const [scopeTab, setScopeTab] = useState<ScopeTab>('open');
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [merged, setMerged] = useState<MergedAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myAthleteId, setMyAthleteId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [myDivisions, setMyDivisions] = useState<{ engine: Division; run: Division }>({
    engine: 'Open',
    run: 'Open',
  });
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [appliedRequest, setAppliedRequest] = useState<BoardRequest | null>(null);

  const boardRequest: BoardRequest = useMemo(
    () => ({ league: activeLeague, seasonId: selectedSeasonId, scopeTab }),
    [activeLeague, selectedSeasonId, scopeTab],
  );
  const boardRequestRef = useRef(boardRequest);
  boardRequestRef.current = boardRequest;
  const loadGenRef = useRef(0);

  const myDivision = myDivisions[activeLeague];
  const boardMatchesSelection =
    appliedRequest != null && isSameBoardRequest(appliedRequest, boardRequest);

  const loadAll = useCallback(
    async (options?: { silent?: boolean }) => {
      const gen = ++loadGenRef.current;
      const requested: BoardRequest = {
        league: activeLeague,
        seasonId: selectedSeasonId,
        scopeTab,
      };
      const isCurrent = () =>
        gen === loadGenRef.current && isSameBoardRequest(boardRequestRef.current, requested);

      if (!options?.silent) {
        setLoading(true);
      }
      setLoadingMore(false);
      if (!isCurrent()) return;
      setError(null);

      const [{ data: auth }, { data: seasonRows, error: seasonsErr }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('seasons').select('id,name,is_active').order('starts_at', { ascending: false }),
      ]);
      if (!isCurrent()) return;

      const uid = auth.user?.id ?? null;
      setCurrentUserId(uid);

      const list = (seasonRows ?? []) as SeasonOption[];
      if (!seasonsErr) {
        setSeasons(list);
      }

      const activeSeason = list.find((s) => s.is_active) ?? list[0] ?? null;
      const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

      let aid: string | null = null;
      if (uid) {
        aid = (await resolveAthleteId(uid)) ?? null;
        if (!isCurrent()) return;
        setMyAthleteId(aid);
        if (aid) {
          const friends = await fetchAcceptedFriendIds(aid);
          if (!isCurrent()) return;
          setFriendIds(new Set(friends));
        } else {
          setFriendIds(new Set());
        }
      } else {
        setMyAthleteId(null);
        setFriendIds(new Set());
      }

      if (!seasonId) {
        if (!isCurrent()) return;
        setMerged([]);
        setHasMore(false);
        setAppliedRequest({ ...requested, seasonId: null });
        setLoading(false);
        return;
      }

      let division: Division = 'Open';
      if (aid) {
        const nextDivisions = await fetchMyDivisions(aid, seasonId);
        if (!isCurrent()) return;
        setMyDivisions(nextDivisions);
        division = nextDivisions[requested.league];
      } else if (isCurrent()) {
        setMyDivisions({ engine: 'Open', run: 'Open' });
      } else {
        return;
      }

      const view =
        requested.scopeTab === 'open'
          ? 'season_division_leaderboard'
          : 'season_overall_leaderboard';
      const pack = await fetchSeasonBoard(
        view,
        seasonId,
        requested.league,
        requested.scopeTab === 'open' ? division : null,
      );
      if (!isCurrent()) return;

      if (pack.error) {
        setError(pack.error);
        setMerged([]);
        setHasMore(false);
      } else {
        setMerged(pack.merged);
        setHasMore(pack.merged.length === BOARD_PAGE_SIZE);
      }
      setAppliedRequest({ ...requested, seasonId });
      setLoading(false);
    },
    [selectedSeasonId, activeLeague, scopeTab],
  );

  useEffect(() => {
    if (selectedSeasonId) return;
    let cancelled = false;
    void (async () => {
      const { data: seasonRows } = await supabase
        .from('seasons')
        .select('id,name,is_active')
        .order('starts_at', { ascending: false });
      if (cancelled) return;
      const list = (seasonRows ?? []) as SeasonOption[];
      setSeasons(list);
      const active = list.find((s) => s.is_active) ?? list[0];
      if (active) {
        setSelectedSeasonId(active.id);
      } else {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSeasonId]);

  useEffect(() => {
    if (!selectedSeasonId) return;
    void loadAll();
  }, [loadAll, selectedSeasonId]);

  useEffect(() => {
    if (loading || !boardMatchesSelection) return;
    setLeaderboardCache({
      seasons,
      selectedSeasonId,
      merged,
      currentUserId,
      myAthleteId,
      friendIds: [...friendIds],
      myDivision,
      activeLeague,
      scopeTab,
      countryFilter,
      genderFilter,
      error,
    });
  }, [
    loading,
    boardMatchesSelection,
    seasons,
    selectedSeasonId,
    merged,
    currentUserId,
    myAthleteId,
    friendIds,
    myDivision,
    activeLeague,
    scopeTab,
    countryFilter,
    genderFilter,
    error,
  ]);

  const loadMore = useCallback(async () => {
    if (!selectedSeasonId || loadingMore || !hasMore) return;
    const gen = loadGenRef.current;
    const requested: BoardRequest = {
      league: activeLeague,
      seasonId: selectedSeasonId,
      scopeTab,
    };
    const isCurrent = () =>
      gen === loadGenRef.current && isSameBoardRequest(boardRequestRef.current, requested);

    setLoadingMore(true);
    const view =
      requested.scopeTab === 'open'
        ? 'season_division_leaderboard'
        : 'season_overall_leaderboard';
    const pack = await fetchSeasonBoard(
      view,
      selectedSeasonId,
      requested.league,
      requested.scopeTab === 'open' ? myDivision : null,
      merged.length,
    );
    if (!isCurrent()) {
      setLoadingMore(false);
      return;
    }
    if (!pack.error) {
      setMerged((prev) => [...prev, ...pack.merged]);
      setHasMore(pack.merged.length === BOARD_PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [
    selectedSeasonId,
    loadingMore,
    hasMore,
    scopeTab,
    activeLeague,
    myDivision,
    merged.length,
  ]);

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(loadAll);

  const selectedSeason = useMemo(
    () => seasons.find((s) => s.id === selectedSeasonId) ?? seasons.find((s) => s.is_active) ?? null,
    [seasons, selectedSeasonId],
  );

  const seasonLabel = seasonShortLabel(selectedSeason?.name);
  const seasonLiveSubtitle = seasonSubtitle(selectedSeason?.name);

  const countryOptions = useMemo(() => {
    const names = new Set<string>();
    for (const m of merged) {
      if (m.country?.trim()) names.add(m.country.trim());
    }
    return [
      { value: 'all', label: 'All' },
      ...[...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name })),
    ];
  }, [merged]);

  useEffect(() => {
    if (countryFilter === 'all') return;
    if (!countryOptions.some((o) => o.value === countryFilter)) {
      setCountryFilter('all');
    }
  }, [countryOptions, countryFilter]);

  const seasonOptions = useMemo(
    () =>
      seasons.map((s) => ({
        value: s.id,
        label: seasonShortLabel(s.name),
      })),
    [seasons],
  );

  const recordedAtById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of merged) map.set(m.id, m.recorded_at);
    return map;
  }, [merged]);

  const rows = useMemo(() => {
    let base: LeaderboardRow[] = merged.map((m) => ({
      id: m.id,
      rank: m.rank,
      score: m.season_score,
      displayName: m.display_name,
      username: m.username || m.display_name || 'Athlete',
      country: m.country,
      avatarUrl: m.avatar_url,
    }));

    if (countryFilter !== 'all') {
      base = base.filter((r) => r.country === countryFilter);
    }

    if (genderFilter !== 'all') {
      const genderById = new Map(merged.map((m) => [m.id, m.gender]));
      base = base.filter((r) => genderById.get(r.id) === genderFilter);
    }

    if (scopeTab === 'friends') {
      base = base.filter((r) => friendIds.has(r.id) || r.id === myAthleteId);
    }

    const hiddenFromLeague = base.some((r) => isHiddenFromLeaderboard(r.id, activeLeague));
    if (hiddenFromLeague) {
      base = base.filter((r) => !isHiddenFromLeaderboard(r.id, activeLeague));
    }

    const clientFiltered =
      countryFilter !== 'all' ||
      genderFilter !== 'all' ||
      scopeTab === 'friends' ||
      hiddenFromLeague;

    if (clientFiltered) {
      base = reRankBySeasonTieBreak(base, recordedAtById);
    }

    return base;
  }, [
    merged,
    activeLeague,
    scopeTab,
    countryFilter,
    genderFilter,
    friendIds,
    myAthleteId,
    recordedAtById,
  ]);

  const countryFilterLabel =
    countryOptions.find((o) => o.value === countryFilter)?.label ?? 'All';

  const genderFilterLabel = GENDER_OPTIONS.find((o) => o.value === genderFilter)?.label ?? 'All';

  const scopeSubtitle = useMemo(() => {
    const leagueLabel = activeLeague === 'engine' ? 'Engine' : 'Run';
    const parts: string[] = [];

    if (scopeTab === 'open') {
      parts.push(`${myDivision} division · promotion board`);
    } else if (scopeTab === 'overall') {
      parts.push('All divisions · browse only');
    } else if (scopeTab === 'friends') {
      parts.push('Friends · season scores');
    }

    parts.push(leagueLabel);
    if (countryFilter !== 'all') parts.push(countryFilterLabel);
    if (genderFilter !== 'all') parts.push(genderFilterLabel);

    return parts.join(' · ');
  }, [
    scopeTab,
    activeLeague,
    myDivision,
    countryFilter,
    countryFilterLabel,
    genderFilter,
    genderFilterLabel,
  ]);

  const scopeTabs: { id: ScopeTab; label: string }[] = [
    { id: 'open', label: myDivision },
    { id: 'overall', label: 'Overall' },
    { id: 'friends', label: 'Friends' },
  ];

  const showBoard = !loading && boardMatchesSelection;

  return (
    <section className="mx-auto flex max-w-lg flex-col gap-5 pb-2" {...pullHandlers}>
      {(isRefreshing || pullDistance > 0) && (
        <p className="text-center text-xs text-muted-foreground">
          {isRefreshing ? 'Refreshing…' : pullDistance > 72 ? 'Release to refresh' : ''}
        </p>
      )}

      <div className="flex items-center justify-center gap-2 rounded-xl border border-neon-lime/35 bg-[hsla(72,35%,12%,0.45)] px-3.5 py-2.5 text-center">
        <Zap className="h-4 w-4 shrink-0 text-neon-lime" aria-hidden />
        <p className="text-sm font-medium leading-snug text-neon-lime">
          <span className="font-semibold">
            {seasonLabel} is LIVE
            {seasonLiveSubtitle ? ` - ${seasonLiveSubtitle}` : ''}
          </span>
        </p>
      </div>

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
              : 'bg-transparent text-muted-foreground hover:text-foreground',
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
              ? 'bg-electric-cyan text-black shadow-sm'
              : 'bg-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          RUN
        </button>
      </div>

      <div className="rounded-xl border border-border/60 bg-[hsla(0,0%,10%,1)] p-1">
        <div className="grid grid-cols-3 gap-0.5">
          {scopeTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                haptic('light');
                setScopeTab(t.id);
              }}
              className={cn(
                'rounded-lg py-2.5 text-center text-xs font-semibold transition-colors',
                scopeTab === t.id
                  ? 'bg-muted text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground/90',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {seasonOptions.length > 0 && selectedSeasonId ? (
          <LeaderboardFilterSelect
            aria-label="Season"
            value={selectedSeasonId}
            onValueChange={(id) => {
              haptic('light');
              setSelectedSeasonId(id);
            }}
            options={seasonOptions}
          />
        ) : (
          <div
            className="flex flex-1 items-center justify-center rounded-lg border border-border bg-[hsla(0,0%,8%,1)] px-2 py-2.5 text-xs font-medium text-foreground sm:px-3"
            aria-label="Season"
          >
            {seasonLabel}
          </div>
        )}
        <LeaderboardFilterSelect
          aria-label="Country"
          icon={Globe}
          value={countryFilter}
          onValueChange={(v) => {
            haptic('light');
            setCountryFilter(v);
          }}
          options={countryOptions}
        />
        <LeaderboardFilterSelect
          aria-label="Gender"
          icon={Users}
          value={genderFilter}
          onValueChange={(v) => {
            haptic('light');
            setGenderFilter(v as GenderFilter);
          }}
          options={GENDER_OPTIONS}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">{scopeSubtitle}</p>
      {scopeTab === 'overall' ? (
        <p className="text-center text-[11px] text-muted-foreground/80">
          Overall is browse-only. Promotion and relegation use your {myDivision} division board.
        </p>
      ) : null}

      {showBoard && error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!showBoard ? (
        <LeaderboardSkeleton />
      ) : scopeTab === 'friends' ? (
        <PremiumGate
          title="Friends leaderboard"
          description="Compare season scores with athletes you've added as friends."
          previewContent={friendIds.size === 0 ? <FriendsPreview /> : undefined}
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
              No scored friends for this scoring type yet
            </p>
          ) : (
            <LeaderboardRows rows={rows} league={activeLeague} currentUserId={currentUserId} />
          )}
        </PremiumGate>
      ) : !error && rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-[hsla(0,0%,10%,1)] px-4 py-10 text-center text-sm text-muted-foreground">
          {merged.length === 0 ? 'No athletes ranked yet' : 'No athletes match these filters'}
        </p>
      ) : (
        !error && (
          <LeaderboardRows rows={rows} league={activeLeague} currentUserId={currentUserId} />
        )
      )}

      {showBoard && !error && hasMore ? (
        <button
          type="button"
          className="mx-auto rounded-lg border border-border bg-[hsla(0,0%,10%,1)] px-4 py-2.5 text-sm font-medium text-foreground disabled:opacity-50"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}
