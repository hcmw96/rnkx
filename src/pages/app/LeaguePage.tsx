import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, Share2, Timer } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { Button } from '@/components/ui/button';
import { EditLeagueModal } from '@/components/leagues/EditLeagueModal';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { shareLeagueInvite } from '@/lib/shareLeagueInvite';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { cn } from '@/lib/utils';

type League = {
  id: string;
  name: string;
  image_url: string | null;
  league_type: 'engine' | 'run';
  created_by: string;
  conversation_id: string | null;
  invite_code: string | null;
  is_public: boolean | null;
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

export default function LeaguePage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [scoreByAthlete, setScoreByAthlete] = useState<Record<string, number>>({});
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

    const { data: leagueRow, error: leagueErr } = await supabase
      .from('private_leagues')
      .select('id, name, image_url, league_type, created_by, conversation_id, invite_code, is_public')
      .eq('id', leagueId)
      .maybeSingle();

    if (leagueErr || !leagueRow) {
      toast.error(leagueErr?.message ?? 'Club not found');
      setLeague(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    setLeague(leagueRow as League);

    const { data: memRows, error: memErr } = await supabase
      .from('private_league_members')
      .select('athlete_id, athletes(id, username, avatar_url)')
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

    const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).maybeSingle();
    const sid = (season?.id as string | undefined) ?? null;
    setSeasonId(sid);
    if (sid && memberIds.length && leagueRow.league_type) {
      const { data: stats } = await supabase
        .from('athlete_stats')
        .select('athlete_id, score')
        .eq('season_id', sid)
        .eq('category', leagueRow.league_type)
        .in('athlete_id', memberIds);
      const map: Record<string, number> = {};
      for (const s of stats ?? []) {
        map[s.athlete_id as string] = Number(s.score ?? 0);
      }
      setScoreByAthlete(map);
    } else {
      setScoreByAthlete({});
    }

    setLoading(false);
  }, [leagueId]);

  useEffect(() => {
    void loadLeague();
  }, [loadLeague]);

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(loadLeague);

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

  const isCreator = league && athleteId && league.created_by === athleteId;

  const scoreColorClass = league?.league_type === 'run' ? 'text-secondary' : 'text-primary';
  const selfBorderClass =
    league?.league_type === 'run'
      ? 'border-electric-cyan/50 ring-1 ring-electric-cyan/20'
      : 'border-neon-lime/50 ring-1 ring-neon-lime/20';

  return (
    <AppShell>
      <PremiumGate athleteId={athleteId} userId={authUserId}>
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
              <header className="space-y-2">
                <div className="flex items-start gap-3">
                  {league.image_url ? (
                    <img
                      src={league.image_url}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <h1 className="type-page-title leading-tight">{league.name}</h1>
                    <div className="flex flex-wrap items-center gap-2">
                      {/* League type badge — prominent */}
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
                      <span className="text-xs text-muted-foreground">
                        {league.is_public ? 'Public' : 'Private'} · {members.length} member{members.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {isCreator ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                      Edit club
                    </Button>
                    {league.invite_code ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => void shareLeagueInvite(league.name, league.invite_code!)}
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Invite
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </header>

              {/* Leaderboard */}
              <div className="space-y-1">
                <h2 className="type-section-label px-0.5 pb-1">Leaderboard</h2>
                {rankedRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    No members with scores yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5 px-0.5 pb-4">
                    {rankedRows.map((row) => {
                      const isSelf = row.athleteId === athleteId;
                      const isFirst = row.rank === 1;
                      const initial = row.username.charAt(0).toUpperCase();
                      const pts = Math.round(row.score);

                      return (
                        <li key={row.athleteId}>
                          <div
                            className={cn(
                              'flex items-center gap-2 rounded-lg border bg-[hsla(0,0%,10%,1)] px-2.5 py-2 shadow-sm',
                              isSelf ? selfBorderClass : 'border-border/70',
                            )}
                          >
                            <span
                              className={cn(
                                'type-rank w-9 shrink-0 text-center',
                                isFirst ? 'text-neon-lime' : '!text-foreground',
                              )}
                            >
                              {row.rank}
                            </span>
                            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/80 bg-[hsla(0,0%,14%,1)]">
                              {row.avatar_url ? (
                                <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                                  {initial}
                                </span>
                              )}
                            </div>
                            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-1">
                              <p className="type-heading truncate">
                                {row.username}
                                {isSelf ? (
                                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">you</span>
                                ) : null}
                              </p>
                              <p className={cn('shrink-0 whitespace-nowrap tabular-nums', scoreColorClass)}>
                                <span className="text-lg font-bold">{pts.toLocaleString()}</span>
                                <span className="ml-1 text-xs font-medium text-muted-foreground">pts</span>
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {isCreator && league ? (
                <EditLeagueModal
                  open={editOpen}
                  onOpenChange={setEditOpen}
                  league={{
                    id: league.id,
                    name: league.name,
                    image_url: league.image_url,
                    is_public: league.is_public,
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
