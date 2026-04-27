import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LeaguePodium } from '@/components/leagues/LeaguePodium';
import { LeagueHighlights } from '@/components/leagues/LeagueHighlights';
import { LeagueActivityFeed } from '@/components/leagues/LeagueActivityFeed';
import { EditLeagueModal } from '@/components/leagues/EditLeagueModal';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import type { RealtimeChannel } from '@supabase/supabase-js';

type League = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  league_type: 'engine' | 'run';
  created_by: string;
  conversation_id: string | null;
};

type MemberRow = {
  athlete_id: string;
  athletes: { id: string; username: string | null; avatar_url: string | null } | null;
};

type ChatMessage = {
  id: string;
  body: string;
  created_at: string;
  athlete_id: string;
  athletes?: { username: string | null } | null;
};

export default function LeaguePage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [scoreByAthlete, setScoreByAthlete] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
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
      setLeague(null);
      setLoading(false);
      return;
    }
    const [byUserId, byId] = await Promise.all([
      supabase.from('athletes').select('id').eq('user_id', uid).not('username', 'is', null).maybeSingle(),
      supabase.from('athletes').select('id').eq('id', uid).not('username', 'is', null).maybeSingle(),
    ]);
    const aid = (byUserId.data?.id ?? byId.data?.id) as string | undefined;
    setAthleteId(aid);

    const { data: leagueRow, error: leagueErr } = await supabase
      .from('private_leagues')
      .select('id, name, description, image_url, league_type, created_by, conversation_id')
      .eq('id', leagueId)
      .maybeSingle();

    if (leagueErr || !leagueRow) {
      toast.error(leagueErr?.message ?? 'League not found');
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
    if (memErr) {
      toast.error(memErr.message);
      setMembers([]);
    } else {
      const raw = (memRows ?? []) as unknown as {
        athlete_id: string;
        athletes?: MemberRow['athletes'] | MemberRow['athletes'][] | null;
      }[];
      memberIds = raw.map((r) => r.athlete_id);
      setMembers(
        raw.map((r) => ({
          athlete_id: r.athlete_id,
          athletes: Array.isArray(r.athletes) ? r.athletes[0] ?? null : r.athletes ?? null,
        })),
      );
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

    const cid = leagueRow.conversation_id as string | null;
    if (cid) {
      const { data: msgs } = await supabase
        .from('conversation_messages')
        .select('id, body, created_at, athlete_id, athletes(username)')
        .eq('conversation_id', cid)
        .order('created_at', { ascending: true })
        .limit(200);
      const mraw = (msgs ?? []) as unknown as {
        id: string;
        body: string;
        created_at: string;
        athlete_id: string;
        athletes?: ChatMessage['athletes'] | ChatMessage['athletes'][] | null;
      }[];
      setMessages(
        mraw.map((m) => ({
          ...m,
          athletes: Array.isArray(m.athletes) ? m.athletes[0] ?? null : m.athletes ?? null,
        })),
      );
    } else {
      setMessages([]);
    }

    setLoading(false);
  }, [leagueId]);

  useEffect(() => {
    void loadLeague();
  }, [loadLeague]);

  useEffect(() => {
    const cid = league?.conversation_id;
    if (!cid) return;

    const channel: RealtimeChannel = supabase
      .channel(`conversation_messages:${cid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
          filter: `conversation_id=eq.${cid}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const uname =
              membersRef.current.find((x) => x.athlete_id === row.athlete_id)?.athletes?.username ?? null;
            return [...prev, { ...row, athletes: row.athletes ?? { username: uname } }];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [league?.conversation_id]);

  const memberIds = useMemo(() => members.map((m) => m.athlete_id), [members]);

  const usernameByAthleteId = useMemo(
    () =>
      Object.fromEntries(
        members.map((m) => [m.athlete_id, m.athletes?.username ?? null] as const),
      ) as Record<string, string | null>,
    [members],
  );

  const podiumMembers = useMemo(() => {
    const rows = members
      .map((m) => {
        const a = m.athletes;
        const username = a?.username?.trim() || 'Athlete';
        const score = scoreByAthlete[m.athlete_id] ?? 0;
        return {
          id: m.athlete_id,
          username,
          avatar_url: a?.avatar_url ?? null,
          score,
          rank: 0,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((m, i) => ({ ...m, rank: i + 1 }));
    return rows;
  }, [members, scoreByAthlete]);

  const isCreator = league && athleteId && league.created_by === athleteId;

  const sendChat = async () => {
    const text = chatInput.trim();
    const cid = league?.conversation_id;
    const aid = athleteId;
    if (!text || !cid || !aid) return;
    const { error } = await supabase.from('conversation_messages').insert({
      conversation_id: cid,
      athlete_id: aid,
      body: text,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setChatInput('');
  };

  return (
    <AppShell>
      <PremiumGate athleteId={athleteId}>
        <section className="mx-auto max-w-lg space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1 px-2">
              <Link to="/app/leagues">
                <ArrowLeft className="h-4 w-4" />
                Leagues
              </Link>
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !league ? (
            <p className="text-sm text-destructive">League not found.</p>
          ) : (
            <>
              <header className="space-y-1">
                <h1 className="font-display text-xl text-foreground">{league.name}</h1>
                {league.description ? <p className="text-sm text-muted-foreground">{league.description}</p> : null}
                {isCreator ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    Edit league
                  </Button>
                ) : null}
              </header>

              <LeaguePodium members={podiumMembers} leagueType={league.league_type} />
              <LeagueHighlights memberIds={memberIds} leagueType={league.league_type} seasonId={seasonId} />
              <LeagueActivityFeed memberIds={memberIds} leagueType={league.league_type} seasonId={seasonId} />

              {league.conversation_id ? (
                <div id="chat" className="space-y-2 rounded-xl border border-border bg-card p-3">
                  <h2 className="font-display text-sm uppercase tracking-wider text-muted-foreground">Group chat</h2>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {messages.map((m) => (
                      <div key={m.id} className="text-sm">
                        <span className="font-medium text-foreground">
                          {m.athletes?.username ?? usernameByAthleteId[m.athlete_id] ?? 'Member'}:{' '}
                        </span>
                        <span className="text-muted-foreground">{m.body}</span>
                      </div>
                    ))}
                    {!messages.length ? (
                      <p className="text-xs text-muted-foreground">No messages yet. Say hi!</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Message…"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void sendChat();
                      }}
                    />
                    <Button type="button" size="icon" onClick={() => void sendChat()} aria-label="Send">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}

              {isCreator && league ? (
                <EditLeagueModal
                  open={editOpen}
                  onOpenChange={setEditOpen}
                  league={{
                    id: league.id,
                    name: league.name,
                    description: league.description,
                    image_url: league.image_url,
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
