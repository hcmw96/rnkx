import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { CreateLeagueModal } from '@/components/leagues/CreateLeagueModal';
import { PrivateLeagueCard } from '@/components/leagues/PrivateLeagueCard';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { shareLeagueInvite } from '@/lib/shareLeagueInvite';

type LeagueRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  conversation_id: string | null;
  league_type: string;
  invite_code: string | null;
};

type PrivateLeaguesPageProps = {
  embedded?: boolean;
};

export default function PrivateLeaguesPage({ embedded = false }: PrivateLeaguesPageProps) {
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  const [leagues, setLeagues] = useState<{ league: LeagueRow; memberCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      toast.error(authErr?.message ?? 'Not signed in');
      setAthleteId(undefined);
      setAuthUserId(undefined);
      setLeagues([]);
      setLoading(false);
      return;
    }

    const uid = auth.user.id;
    setAuthUserId(uid);
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
      .select('id, name, description, image_url, conversation_id, league_type, invite_code')
      .in('id', leagueIds);

    if (leagueErr) {
      toast.error(leagueErr.message);
      setLeagues([]);
      setLoading(false);
      return;
    }

    const { data: allMembers } = await supabase.from('private_league_members').select('league_id').in('league_id', leagueIds);

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

  const content = (
    <section className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between gap-3">
        {!embedded ? (
          <h1 className="font-display text-xl text-foreground">Private leagues</h1>
        ) : (
          <h2 className="font-display text-lg text-foreground">Leagues</h2>
        )}
        {athleteId ? <CreateLeagueModal athleteId={athleteId} onCreated={() => void load()} /> : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : leagues.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No leagues yet. Create one to compete with friends.
        </p>
      ) : (
        <ul className="space-y-2">
          {leagues.map(({ league, memberCount }) => (
            <li key={league.id}>
              <PrivateLeagueCard
                id={league.id}
                name={league.name}
                memberCount={memberCount}
                inviteCode={league.invite_code}
                conversationId={league.conversation_id}
                imageUrl={league.image_url}
                description={league.description}
                onShareInvite={() => {
                  if (!league.invite_code) {
                    toast.error('Invite link is not available for this league yet.');
                    return;
                  }
                  void shareLeagueInvite(league.name, league.invite_code);
                }}
              />
            </li>
          ))}
        </ul>
      )}
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
