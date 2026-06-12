import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Globe, Users, Zap } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { LeaderboardRows } from '@/components/leaderboard/LeaderboardRows';
import { PremiumGate } from '@/components/PremiumGate';
import { FriendsPreview } from '@/components/premium/PreviewMocks';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { divisionForRank, type Division } from '@/lib/division';
import { fetchAcceptedFriendIds } from '@/lib/friendships';
import { isHiddenFromLeaderboard } from '@/lib/leaderboardHidden';
import { haptic } from '@/lib/haptics';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';

type League = 'engine' | 'run';
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
  gender: string | null;
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
  gender: 'male' | 'female' | null;
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

/** Re-assign ranks 1..n by score after client-side filters (gender, country, division, friends). */
function reRankByScore(rows: LeaderboardRow[]): LeaderboardRow[] {
  return [...rows]
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));
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

const LEADERBOARD_COLUMNS = 'id,display_name,total_score,rank';
const ATHLETE_ENRICH_COLUMNS = 'id,username,country,avatar_url,gender';
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
      gender: normalizeGender(a?.gender),
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
  const [myDivision, setMyDivision] = useState<Division>('Open');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [{ data: auth }, { data: seasonRows, error: seasonsErr }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('seasons').select('id,name,is_active').order('starts_at', { ascending: false }),
    ]);

    const uid = auth.user?.id ?? null;
    setCurrentUserId(uid);

    const list = (seasonRows ?? []) as SeasonOption[];
    if (!seasonsErr) {
      setSeasons(list);
    }

    const activeSeason = list.find((s) => s.is_active) ?? list[0] ?? null;
    const seasonId = selectedSeasonId ?? activeSeason?.id ?? null;

    if (uid) {
      const aid = await resolveAthleteId(uid);
      setMyAthleteId(aid ?? null);
      if (aid) {
        const friends = await fetchAcceptedFriendIds(aid);
        setFriendIds(new Set(friends));
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
  }, [selectedSeasonId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (selectedSeasonId || seasons.length === 0) return;
    const active = seasons.find((s) => s.is_active) ?? seasons[0];
    if (active) setSelectedSeasonId(active.id);
  }, [seasons, selectedSeasonId]);

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(loadAll);

  useEffect(() => {
    if (!myAthleteId || merged.length === 0) return;
    const me = buildRowsForLeague(merged, activeLeague).find((r) => r.id === myAthleteId);
    if (me) {
      setMyDivision(divisionForRank(me.rank));
    }
  }, [merged, activeLeague, myAthleteId]);

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

  const effectiveDivision = useMemo((): Division | null => {
    if (scopeTab === 'open') return myDivision;
    return null;
  }, [scopeTab, myDivision]);

  const rows = useMemo(() => {
    let base = buildRowsForLeague(merged, activeLeague);

    if (effectiveDivision) {
      base = base.filter((r) => divisionForRank(r.rank) === effectiveDivision);
    }

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
      effectiveDivision != null ||
      countryFilter !== 'all' ||
      genderFilter !== 'all' ||
      scopeTab === 'friends' ||
      hiddenFromLeague;

    if (clientFiltered) {
      base = reRankByScore(base);
    }

    return base;
  }, [
    merged,
    activeLeague,
    scopeTab,
    effectiveDivision,
    countryFilter,
    genderFilter,
    friendIds,
    myAthleteId,
  ]);

  const countryFilterLabel =
    countryOptions.find((o) => o.value === countryFilter)?.label ?? 'All';

  const genderFilterLabel = GENDER_OPTIONS.find((o) => o.value === genderFilter)?.label ?? 'All';

  const scopeSubtitle = useMemo(() => {
    const leagueLabel = activeLeague === 'engine' ? 'Engine' : 'Run';
    const parts: string[] = [];

    if (scopeTab === 'open') {
      parts.push(
        effectiveDivision ? `${effectiveDivision} division` : `${myDivision} division`,
      );
    } else if (scopeTab === 'overall') {
      parts.push(effectiveDivision ? `${effectiveDivision} division` : 'All divisions');
    } else if (scopeTab === 'friends') {
      parts.push('Friends');
    } else {
      return seasonLabel;
    }

    parts.push(leagueLabel);
    if (countryFilter !== 'all') parts.push(countryFilterLabel);
    if (genderFilter !== 'all') parts.push(genderFilterLabel);

    return parts.join(' · ');
  }, [
    scopeTab,
    activeLeague,
    effectiveDivision,
    myDivision,
    countryFilter,
    countryFilterLabel,
    genderFilter,
    genderFilterLabel,
    seasonLabel,
  ]);

  const scopeTabs: { id: ScopeTab; label: string }[] = [
    { id: 'open', label: 'Open' },
    { id: 'overall', label: 'Overall' },
    { id: 'friends', label: 'Friends' },
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
        <div className="flex items-center justify-center gap-2 rounded-xl border border-neon-lime/35 bg-[hsla(72,35%,12%,0.45)] px-3.5 py-2.5 text-center">
          <Zap className="h-4 w-4 shrink-0 text-neon-lime" aria-hidden />
          <p className="text-sm font-medium leading-snug text-neon-lime">
            <span className="font-semibold">
              {seasonLabel} is LIVE
              {seasonLiveSubtitle ? ` - ${seasonLiveSubtitle}` : ''}
            </span>
          </p>
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
                ? 'bg-electric-cyan text-black shadow-sm'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            RUN
          </button>
        </div>

        {/* Secondary scope tabs */}
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

        {/* Filter row */}
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
            description="Compare scores with athletes you've added as friends."
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
              <LeaderboardRows
                rows={rows}
                league={activeLeague}
                currentUserId={currentUserId}
                friendIds={friendIds}
              />
            )}
          </PremiumGate>
        ) : !error && rows.length === 0 ? (
          <p className="rounded-xl border border-border bg-[hsla(0,0%,10%,1)] px-4 py-10 text-center text-sm text-muted-foreground">
            {merged.length === 0
              ? 'No athletes ranked yet'
              : 'No athletes match these filters'}
          </p>
        ) : (
          !error && (
            <LeaderboardRows
              rows={rows}
              league={activeLeague}
              currentUserId={currentUserId}
              friendIds={friendIds}
            />
          )
        )}

      </section>
    </AppShell>
  );
}
