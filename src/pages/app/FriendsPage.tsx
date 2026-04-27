import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { Search, UserPlus, Check, X } from 'lucide-react';

type AthleteLite = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
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
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AthleteLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [incoming, setIncoming] = useState<(FriendshipRow & { requester: AthleteLite })[]>([]);
  const [friends, setFriends] = useState<FriendWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFriendsData = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setAthleteId(undefined);
      setIncoming([]);
      setFriends([]);
      setLoading(false);
      return;
    }
    const [byUserId, byId] = await Promise.all([
      supabase.from('athletes').select('id').eq('user_id', uid).not('username', 'is', null).maybeSingle(),
      supabase.from('athletes').select('id').eq('id', uid).not('username', 'is', null).maybeSingle(),
    ]);
    const aid = (byUserId.data?.id ?? byId.data?.id) as string | undefined;
    setAthleteId(aid);
    if (!aid) {
      setIncoming([]);
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
          .select('id, username, display_name, avatar_url')
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
          supabase.from('athletes').select('id, username, display_name, avatar_url').in('id', unique),
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
        const q = `%${search.trim()}%`;
        const { data, error } = await supabase
          .from('athletes')
          .select('id, username, display_name, avatar_url')
          .ilike('username', q)
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
    const { error } = await supabase.from('friendships').insert({
      athlete_id: athleteId,
      friend_id: friendId,
      status: 'pending',
    });
    if (error) {
      if (error.code === '23505') {
        toast.error('Friend request already exists.');
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success('Friend request sent.');
    setSearch('');
    setResults([]);
  };

  const respond = async (rowId: string, accept: boolean) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', rowId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(accept ? 'Friend added.' : 'Request declined.');
    void loadFriendsData();
  };

  const content = (
    <section className="mx-auto max-w-lg space-y-6">
      {!embedded ? <h1 className="font-display text-xl text-foreground">Friends</h1> : null}

          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search athletes by username…"
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
                      <p className="truncate text-sm font-medium text-foreground">
                        {a.display_name || a.username || 'Athlete'}
                      </p>
                      <p className="text-xs text-muted-foreground">@{a.username ?? '—'}</p>
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
            <h2 className="text-sm font-semibold text-foreground">Incoming requests</h2>
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
                      <p className="truncate text-sm font-medium">
                        {r.requester.display_name || r.requester.username || 'Athlete'}
                      </p>
                      <p className="text-xs text-muted-foreground">@{r.requester.username ?? '—'}</p>
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
            <h2 className="text-sm font-semibold text-foreground">Your friends</h2>
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : friends.length === 0 ? (
              <p className="text-xs text-muted-foreground">No friends yet. Send a request above.</p>
            ) : (
              <ul className="space-y-2">
                {friends.map((f) => (
                  <li key={f.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{f.display_name || f.username}</p>
                        <p className="text-xs text-muted-foreground">@{f.username ?? '—'}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <div>Rank {f.rank != null ? `#${f.rank}` : '—'}</div>
                        <div className="font-display text-foreground">{f.total_score.toLocaleString()} pts</div>
                      </div>
                    </div>
                  </li>
                ))}
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
      <PremiumGate athleteId={athleteId}>{content}</PremiumGate>
    </AppShell>
  );
}
