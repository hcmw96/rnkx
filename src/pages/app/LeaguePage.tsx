import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Heart, Pencil, Timer, Trophy } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { Button } from '@/components/ui/button';
import { EditLeagueModal } from '@/components/leagues/EditLeagueModal';
import { LeaderboardRows, type LeaderboardRowData } from '@/components/leaderboard/LeaderboardRows';
import { clubImageDisplayUrl } from '@/lib/clubImageUpload';
import { ClubGenderChip } from '@/components/leagues/ClubGenderChip';
import { fetchPrivateLeague } from '@/lib/clubContext';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

type League = {
  id: string;
  name: string;
  image_url: string | null;
  league_type: 'engine' | 'run';
  created_by: string;
  conversation_id: string | null;
  invite_code: string | null;
  is_public: boolean | null;
  gender: string | null;
};

type MemberRow = {
  athlete_id: string;
  athletes: { id: string; username: string | null; avatar_url: string | null } | null;
};

type RankedRow = {
  athleteId: string;
  username: string;
  avatar_url: string | null;
  score: number;
  rank: number;
};

type ScoreTab = 'season' | 'overall';

function seasonShortLabel(name: string | null | undefined): string {
  if (!name?.trim()) return 'Current Season';
  return name.includes(' - ') ? name.split(' - ')[0].trim() : name.trim();
}

function buildScoreMap(
  rows: { athlete_id: string; score: unknown }[] | null | undefined,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows ?? []) {
    const id = row.athlete_id as string;
    map[id] = (map[id] ?? 0) + Number(row.score ?? 0);
  }
  return map;
}

export default function LeaguePage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [seasonScores, setSeasonScores] = useState<Record<string, number>>({});
  const [overallScores, setOverallScores] = useState<Record<string, number>>({});
  const [activeSeasonLabel, setActiveSeasonLabel] = useState('Current Season');
  const [scoreTab, setScoreTab] = useState<ScoreTab>('season');
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const membersRef = useRef<MemberRow[]>([]);
  membersRef.current = members;

  const loadLeague = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setAthleteId(undefined);
      setAuthUserId(undefined);
      setLeague(null);
      setLoading(false);
      return;
    }
    setAuthUserId(uid);
    const aid = await resolveAthleteId(uid);
    setAthleteId(aid);

    const { league: leagueRow, error: leagueErr } = await fetchPrivateLeague(leagueId);

    if (leagueErr || !leagueRow) {
      toast.error(leagueErr ?? 'Club not found');
      setLeague(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    setLeague(leagueRow as unknown as League);

    const { data: memRows, error: memErr } = await supabase
      .from('private_league_members')
      .select('athlete_id, athletes!athlete_id(id, username, avatar_url)')
      .eq('league_id', leagueId)
      .eq('status', 'accepted');

    let memberIds: string[] = [];
    let memberList: MemberRow[] = [];
    if (memErr) {
      toast.error(memErr.message);
      setMembers([]);
    } else {
      const raw = (memRows ?? []) as unknown as {
        athlete_id: string;
        athletes?: MemberRow['athletes'] | MemberRow['athletes'][] | null;
      }[];
      memberList = raw.map((r) => ({
        athlete_id: r.athlete_id,
        athletes: Array.isArray(r.athletes) ? r.athletes[0] ?? null : r.athletes ?? null,
      }));
      memberIds = memberList.map((r) => r.athlete_id);
      setMembers(memberList);
    }

    const category = leagueRow.league_type as string | undefined;
    const { data: season } = await supabase
      .from('seasons')
      .select('id, name')
      .eq('is_active', true)
      .maybeSingle();
    const sid = (season?.id as string | undefined) ?? null;
    setActiveSeasonLabel(seasonShortLabel(typeof season?.name === 'string' ? season.name : null));

    if (memberIds.length && category) {
      const [seasonRes, overallRes] = await Promise.all([
        sid
          ? supabase
              .from('athlete_stats')
              .select('athlete_id, score')
              .eq('season_id', sid)
              .eq('category', category)
              .in('athlete_id', memberIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('athlete_stats')
          .select('athlete_id, score')
          .eq('category', category)
          .in('athlete_id', memberIds),
      ]);

      if (seasonRes.error) toast.error(seasonRes.error.message);
      if (overallRes.error) toast.error(overallRes.error.message);

      setSeasonScores(buildScoreMap(seasonRes.data as { athlete_id: string; score: unknown }[] | null));
      setOverallScores(buildScoreMap(overallRes.data as { athlete_id: string; score: unknown }[] | null));
    } else {
      setSeasonScores({});
      setOverallScores({});
    }

    setLoading(false);
  }, [leagueId]);

  useEffect(() => {
    void loadLeague();
  }, [loadLeague]);

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(loadLeague);

  const scoreByAthlete = scoreTab === 'season' ? seasonScores : overallScores;
  const isCreator = athleteId != null && league?.created_by === athleteId;

  const rankedRows = useMemo((): RankedRow[] => {
    return members
      .map((m) => ({
        athleteId: m.athlete_id,
        username: m.athletes?.username?.trim() || 'Athlete',
        avatar_url: m.athletes?.avatar_url ?? null,
        score: scoreByAthlete[m.athlete_id] ?? 0,
        rank: 0,
      }))
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [members, scoreByAthlete]);

  const leaderboardRows = useMemo<LeaderboardRowData[]>(
    () =>
      rankedRows.map((row) => ({
        id: row.athleteId,
        rank: row.rank,
        score: row.score,
        displayName: row.username,
        username: row.username,
        country: null,
        avatarUrl: row.avatar_url,
      })),
    [rankedRows],
  );
  const leagueImageUrl = useMemo(
    () =>
      league
        ? clubImageDisplayUrl(league.image_url, {
            cacheKey: league.id,
            leagueType: league.league_type,
          })
        : null,
    [league],
  );

  return (
    <AppShell>
      <PremiumGate
        athleteId={athleteId}
        userId={authUserId}
        description="View club leaderboards, season scores, and member rankings."
      >
        <section className="mx-auto max-w-lg space-y-4" {...pullHandlers}>
          {(isRefreshing || pullDistance > 0) && (
            <p className="text-center text-xs text-muted-foreground">
              {isRefreshing ? 'Refreshing club...' : pullDistance > 72 ? 'Release to refresh' : 'Pull to refresh'}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1 px-2">
              <Link to="/app/social/leagues">
                <ArrowLeft className="h-4 w-4" />
                Clubs
              </Link>
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !league ? (
            <p className="text-sm text-destructive">Club not found.</p>
          ) : (
            <>
              {/* Header */}
              <header className="space-y-2 rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  {leagueImageUrl ? (
                    <img
                      src={leagueImageUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <h1 className="type-heading text-xl leading-tight">{league.name}</h1>
                    <div className="flex flex-wrap items-center gap-2">
                      {league.league_type === 'engine' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          <Heart className="h-3 w-3 fill-primary" />
                          Engine · Heart rate
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary/15 px-2.5 py-0.5 text-xs font-semibold text-secondary">
                          <Timer className="h-3 w-3" />
                          Run · Pace
                        </span>
                      )}
                      <ClubGenderChip gender={league.gender} />
                      <span className="text-xs text-muted-foreground">
                        {league.is_public ? 'Public' : 'Private'} · {members.length} member{members.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  {isCreator ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 border-border"
                      onClick={() => setEditOpen(true)}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit
                    </Button>
                  ) : null}
                </div>
              </header>

              <div className="flex rounded-xl bg-muted/90 p-1" role="tablist" aria-label="Leaderboard timeframe">
                <button
                  type="button"
                  role="tab"
                  aria-selected={scoreTab === 'season'}
                  onClick={() => {
                    haptic('light');
                    setScoreTab('season');
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                    scoreTab === 'season'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Calendar className="h-4 w-4 shrink-0" aria-hidden />
                  {activeSeasonLabel}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scoreTab === 'overall'}
                  onClick={() => {
                    haptic('light');
                    setScoreTab('overall');
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                    scoreTab === 'overall'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Trophy className="h-4 w-4 shrink-0" aria-hidden />
                  Overall
                </button>
              </div>

              {/* Leaderboard */}
              <div className="space-y-1">
                <h2 className="type-section-label px-0.5 pb-1">
                  {scoreTab === 'season' ? `${activeSeasonLabel} leaderboard` : 'All-time leaderboard'}
                </h2>
                {rankedRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    No members with scores yet.
                  </p>
                ) : (
                  <LeaderboardRows
                    rows={leaderboardRows}
                    league={league.league_type === 'run' ? 'run' : 'engine'}
                    currentUserId={athleteId ?? null}
                    showSubtitle={false}
                  />
                )}
              </div>

              {isCreator ? (
                <EditLeagueModal
                  open={editOpen}
                  onOpenChange={setEditOpen}
                  league={{
                    id: league.id,
                    name: league.name,
                    image_url: league.image_url,
                    is_public: league.is_public,
                    gender: league.gender,
                  }}
                  onSaved={() => void loadLeague()}
                />
              ) : null}
            </>
          )}
        </section>
      </PremiumGate>
    </AppShell>
  );
}
