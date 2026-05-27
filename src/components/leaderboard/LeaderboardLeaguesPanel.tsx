import { useCallback, useEffect, useState } from 'react';
import { CreateLeagueModal } from '@/components/leagues/CreateLeagueModal';
import { InviteFriendModal } from '@/components/leagues/InviteFriendModal';
import { PrivateLeagueCard } from '@/components/leagues/PrivateLeagueCard';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';

type LeagueRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  conversation_id: string | null;
  invite_code: string | null;
  league_type: string;
};

export function LeaderboardLeaguesPanel() {
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [leagues, setLeagues] = useState<{ league: LeagueRow; memberCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteLeague, setInviteLeague] = useState<LeagueRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      setAthleteId(undefined);
      setLeagues([]);
      setLoading(false);
      return;
    }

    const uid = auth.user.id;
    const [byUserId, byId] = await Promise.all([
      supabase.from('athletes').select('id').eq('user_id', uid).not('username', 'is', null).maybeSingle(),
      supabase.from('athletes').select('id').eq('id', uid).not('username', 'is', null).maybeSingle(),
    ]);
    const aid = (byUserId.data?.id ?? byId.data?.id) as string | undefined;
    setAthleteId(aid);
    if (!aid) {
      setLeagues([]);
      setLoading(false);
      return;
    }

    const { data: memberships, error: memErr } = await supabase
      .from('private_league_members')
      .select('league_id')
      .eq('athlete_id', aid)
      .eq('status', 'accepted');

    if (memErr) {
      toast.error(memErr.message);
      setLeagues([]);
      setLoading(false);
      return;
    }

    const leagueIds = [...new Set((memberships ?? []).map((m) => m.league_id as string))];
    if (!leagueIds.length) {
      setLeagues([]);
      setLoading(false);
      return;
    }

    const { data: leagueRows, error: leagueErr } = await supabase
      .from('private_leagues')
      .select('id, name, description, image_url, conversation_id, invite_code, league_type')
      .in('id', leagueIds);

    if (leagueErr) {
      toast.error(leagueErr.message);
      setLeagues([]);
      setLoading(false);
      return;
    }

    const { data: allMembers } = await supabase
      .from('private_league_members')
      .select('league_id')
      .in('league_id', leagueIds);

    const countByLeague = new Map<string, number>();
    for (const row of allMembers ?? []) {
      const lid = row.league_id as string;
      countByLeague.set(lid, (countByLeague.get(lid) ?? 0) + 1);
    }

    setLeagues(
      (leagueRows ?? []).map((l) => ({
        league: l as LeagueRow,
        memberCount: countByLeague.get(l.id as string) ?? 0,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="type-card-title">Your Clubs</h3>
        {athleteId ? (
          <CreateLeagueModal
            athleteId={athleteId}
            onCreated={() => void load()}
            triggerLabel="+ New Club"
            triggerClassName="h-9 shrink-0 rounded-lg bg-neon-lime px-3 text-xs font-semibold text-black hover:bg-neon-lime/90"
          />
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading clubs…</p>
      ) : leagues.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 bg-[hsla(0,0%,10%,1)] px-4 py-10 text-center text-sm text-muted-foreground">
          No clubs yet. Create private and public clubs in social tab.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {leagues.map(({ league, memberCount }) => (
            <li key={league.id}>
              <PrivateLeagueCard
                id={league.id}
                name={league.name}
                leagueType={league.league_type === 'run' ? 'run' : 'engine'}
                memberCount={memberCount}
                imageUrl={league.image_url}
                description={league.description}
                conversationId={league.conversation_id}
                onAddFriend={() => setInviteLeague(league)}
              />
            </li>
          ))}
        </ul>
      )}

      {inviteLeague ? (
        <InviteFriendModal
          open={!!inviteLeague}
          onOpenChange={(open) => {
            if (!open) setInviteLeague(null);
          }}
          leagueId={inviteLeague.id}
          leagueName={inviteLeague.name}
          onInvited={() => void load()}
        />
      ) : null}
    </div>
  );
}
