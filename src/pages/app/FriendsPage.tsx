import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MessageCircle, Search, UserPlus, Check, X } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { invokePushNotify } from '@/lib/pushNotify';
import { formatScore } from '@/lib/formatScore';
import { athleteAvatarDisplayUrl, leagueFromSelectedLeagues } from '@/lib/leagueAvatars';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';

type AthleteLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  selected_leagues: string[] | null;
};

type FriendshipRow = {
  id: string;
  athlete_id: string;
  friend_id: string;
  status: string;
};

type FriendWithMeta = AthleteLite & { rank: number | null; total_score: number };

type FriendsPageProps = {
  embedded?: boolean;
};

export default function FriendsPage({ embedded = false }: FriendsPageProps) {
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AthleteLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [incoming, setIncoming] = useState<(FriendshipRow & { requester: AthleteLite })[]>([]);
  const [outgoing, setOutgoing] = useState<(FriendshipRow & { recipient: AthleteLite })[]>([]);
  const [friends, setFriends] = useState<FriendWithMeta[]>([]);
  const [cancellingOutgoingId, setCancellingOutgoingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFriendsData = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setAthleteId(undefined);
      setAuthUserId(undefined);
      setIncoming([]);
      setOutgoing([]);
      setFriends([]);
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
    if (!aid) {
      setIncoming([]);
      setOutgoing([]);
      setFriends([]);
      setLoading(false);
      return;
    }

    const { data: incRows, error: incErr } = await supabase
      .from('friendships')
      .select('id, athlete_id, friend_id, status')
      .eq('friend_id', aid)
      .eq('status', 'pending');

    if (incErr) {
      toast.error(incErr.message);
    } else {
      const ids = [...new Set((incRows ?? []).map((r) => r.athlete_id))];
      let requesterMap = new Map<string, AthleteLite>();
      if (ids.length) {
        const { data: ath } = await supabase
          .from('athletes')
          .select('id, username, display_name, avatar_url, selected_leagues')
          .in('id', ids);
        requesterMap = new Map((ath ?? []).map((a) => [a.id as string, a as AthleteLite]));
      }
      setIncoming(
        (incRows ?? []).map((r) => ({
          ...(r as FriendshipRow),
          requester: requesterMap.get(r.athlete_id as string) ?? {
            id: r.athlete_id,
            username: null,
            display_name: null,
            avatar_url: null,
            selected_leagues: null,
          },
        })),
      );
    }

    const { data: outRows, error: outErr } = await supabase
      .from('friendships')
      .select('id, athlete_id, friend_id, status')
      .eq('athlete_id', aid)
      .eq('status', 'pending');

    if (outErr) {
      toast.error(outErr.message);
    } else {
      const ids = [...new Set((outRows ?? []).map((r) => r.friend_id))];
      let recipientMap = new Map<string, AthleteLite>();
      if (ids.length) {
        const { data: ath } = await supabase
          .from('athletes')
          .select('id, username, display_name, avatar_url, selected_leagues')
          .in('id', ids);
        recipientMap = new Map((ath ?? []).map((a) => [a.id as string, a as AthleteLite]));
      }
      setOutgoing(
        (outRows ?? []).map((r) => ({
          ...(r as FriendshipRow),
          recipient: recipientMap.get(r.friend_id as string) ?? {
            id: r.friend_id,
            username: null,
            display_name: null,
            avatar_url: null,
            selected_leagues: null,
          },
        })),
      );
    }

    const { data: accepted, error: accErr } = await supabase
      .from('friendships')
      .select('id, athlete_id, friend_id, status')
      .or(`athlete_id.eq.${aid},friend_id.eq.${aid}`)
      .eq('status', 'accepted');

    if (accErr) {
      toast.error(accErr.message);
      setFriends([]);
    } else {
      const friendIds = (accepted ?? []).map((r) => (r.athlete_id === aid ? r.friend_id : r.athlete_id));
      const unique = [...new Set(friendIds)];
      if (!unique.length) {
        setFriends([]);
      } else {
        const [{ data: aths }, { data: lb }] = await Promise.all([
          supabase.from('athletes').select('id, username, display_name, avatar_url, selected_leagues').in('id', unique),
          supabase.from('leaderboard').select('id, rank, total_score').in('id', unique),
        ]);
        const lbMap = new Map((lb ?? []).map((l) => [l.id as string, l]));
        setFriends(
          (aths ?? []).map((a) => {
            const row = lbMap.get(a.id as string);
            return {
              ...(a as AthleteLite),
              rank: row?.rank != null ? Number(row.rank) : null,
              total_score: row?.total_score != null ? Number(row.total_score) : 0,
            };
          }),
        );
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFriendsData();
  }, [loadFriendsData]);

  useEffect(() => {
    if (!search.trim() || search.trim().length < 2 || !athleteId) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setSearching(true);
        const q = search.trim();
        const { data, error } = await supabase
          .from('athletes')
          .select('id, username, display_name, avatar_url, selected_leagues')
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .neq('id', athleteId)
          .limit(15);
        if (error) {
          setResults([]);
        } else {
          setResults((data ?? []) as AthleteLite[]);
        }
        setSearching(false);
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [search, athleteId]);

  const sendRequest = async (friendId: string) => {
    if (!athleteId) return;
    const { error } = await supabase.from('friendships').upsert(
      {
        athlete_id: athleteId,
        friend_id: friendId,
        status: 'pending',
      },
      { onConflict: 'athlete_id,friend_id' },
    );
    if (error) {
      if (error.code === '23505') {
        toast.error('Friend request already exists.');
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success('Friend request sent.');
    invokePushNotify('notify-friend-request', {
      from_athlete_id: athleteId,
      to_athlete_id: friendId,
    });
    setSearch('');
    setResults([]);
  };

  const cancelOutgoingRequest = async (rowId: string) => {
    if (!athleteId) return;
    setCancellingOutgoingId(rowId);
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'declined' })
      .eq('id', rowId)
      .eq('athlete_id', athleteId)
      .eq('status', 'pending');
    setCancellingOutgoingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOutgoing((prev) => prev.filter((r) => r.id !== rowId));
    toast.success('Request cancelled.');
  };

  const respond = async (rowId: string, accept: boolean) => {
    const row = incoming.find((r) => r.id === rowId);
    const { error } = await supabase
      .from('friendships')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', rowId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(accept ? 'Friend added.' : 'Request declined.');
    if (accept && athleteId && row?.athlete_id) {
      invokePushNotify('send-notification', {
        athlete_id: row.athlete_id,
        title: 'Friend request accepted',
        message: `${row.requester.display_name || row.requester.username || 'Someone'} accepted your friend request.`,
        path: '/app/social/friends',
      });
    }
    void loadFriendsData();
  };

  const content = (
    <section className="mx-auto max-w-lg space-y-6">
      {!embedded ? <h1 className="type-page-title">Friends</h1> : null}

          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by display name or @username…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {searching ? <p className="text-xs text-muted-foreground">Searching…</p> : null}
            {results.length > 0 ? (
              <ul className="space-y-1 rounded-lg border border-border bg-card p-2">
                {results.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-2">
                    <div className="min-w-0">
                      <p className="type-heading truncate">{a.display_name?.trim() || '—'}</p>
                      <p className="type-meta truncate">{a.username ?? '—'}</p>
                    </div>
                    <Button type="button" size="sm" variant="secondary" onClick={() => void sendRequest(a.id)}>
                      <UserPlus className="mr-1 h-3 w-3" />
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="space-y-2">
            <h2 className="type-heading">Incoming requests</h2>
            {loading ? null : incoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pending requests.</p>
            ) : (
              <ul className="space-y-2">
                {incoming.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="min-w-0">
                      <p className="type-heading truncate">
                        {r.requester.display_name || r.requester.username || 'Athlete'}
                      </p>
                      <p className="type-meta truncate">{r.requester.username ?? '—'}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" size="icon" variant="default" onClick={() => void respond(r.id, true)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="outline" onClick={() => void respond(r.id, false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="type-heading">Outgoing requests</h2>
            {loading ? null : outgoing.length === 0 ? (
              <p className="text-xs text-muted-foreground">No sent requests.</p>
            ) : (
              <ul className="space-y-2">
                {outgoing.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="min-w-0">
                      <p className="type-heading truncate">
                        {r.recipient.display_name || r.recipient.username || 'Athlete'}
                      </p>
                      <p className="type-meta truncate">{r.recipient.username ?? '—'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                        Pending
                      </span>
                      <button
                        type="button"
                        aria-label="Cancel friend request"
                        disabled={cancellingOutgoingId === r.id}
                        onClick={() => void cancelOutgoingRequest(r.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted/30 text-foreground transition hover:bg-muted/50 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="type-heading">Your friends</h2>
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : friends.length === 0 ? (
              <p className="text-xs text-muted-foreground">No friends yet. Send a request above.</p>
            ) : (
              <ul className="space-y-2">
                {friends.map((f) => {
                  const name = f.display_name?.trim() || f.username || 'Athlete';
                  const initial = name.charAt(0).toUpperCase() || '?';
                  const avatarSrc = athleteAvatarDisplayUrl(f.avatar_url, leagueFromSelectedLeagues(f.selected_leagues));
                  return (
                    <li key={f.id}>
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5">
                        <Link
                          to={`/app/friends/${f.id}`}
                          className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:bg-muted/30"
                        >
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border/80 bg-muted">
                            {avatarSrc ? (
                              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center font-sans text-sm font-semibold text-muted-foreground">
                                {initial}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="type-heading truncate">{name}</p>
                            <p className="type-meta truncate">{f.username ?? '—'}</p>
                          </div>
                          <div className="hidden shrink-0 pr-2 text-right sm:block">
                            <p className="type-meta">
                              Rank {f.rank != null ? `#${f.rank}` : '—'}
                            </p>
                            <p className="type-stat text-primary">{formatScore(f.total_score)}</p>
                            <p className="type-stat-unit">pts</p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        </Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="shrink-0 border-neon-lime/40 text-neon-lime hover:bg-neon-lime/10"
                          asChild
                        >
                          <Link to={`/app/chat/${f.id}`} aria-label={`Message ${name}`}>
                            <MessageCircle className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
    </section>
  );

  if (embedded) {
    return content;
  }

  return (
    <AppShell>
      <PremiumGate athleteId={athleteId} userId={authUserId}>
        {content}
      </PremiumGate>
    </AppShell>
  );
}
