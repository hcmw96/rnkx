import { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, Lock } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { CreateLeagueModal } from '@/components/leagues/CreateLeagueModal';
import { InviteFriendModal } from '@/components/leagues/InviteFriendModal';
import { PrivateLeagueCard } from '@/components/leagues/PrivateLeagueCard';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

type LeagueRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  conversation_id: string | null;
  league_type: string;
  invite_code: string | null;
  is_public: boolean | null;
};

type ClubTab = 'private' | 'public';

type PrivateLeaguesPageProps = {
  embedded?: boolean;
};

export default function PrivateLeaguesPage({ embedded = false }: PrivateLeaguesPageProps) {
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  const [leagues, setLeagues] = useState<{ league: LeagueRow; memberCount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteLeague, setInviteLeague] = useState<LeagueRow | null>(null);
  const [clubTab, setClubTab] = useState<ClubTab>('private');

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
      .select('id, name, description, image_url, conversation_id, league_type, invite_code, is_public')
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

  const privateClubs = useMemo(
    () => leagues.filter(({ league }) => !league.is_public),
    [leagues],
  );
  const publicClubs = useMemo(
    () => leagues.filter(({ league }) => league.is_public === true),
    [leagues],
  );

  const visibleClubs = clubTab === 'public' ? publicClubs : privateClubs;

  useEffect(() => {
    if (loading) return;
    if (clubTab === 'private' && privateClubs.length === 0 && publicClubs.length > 0) {
      setClubTab('public');
    } else if (clubTab === 'public' && publicClubs.length === 0 && privateClubs.length > 0) {
      setClubTab('private');
    }
  }, [loading, clubTab, privateClubs.length, publicClubs.length]);

  const renderClubList = (items: { league: LeagueRow; memberCount: number }[]) => (
    <ul className="space-y-2">
      {items.map(({ league, memberCount }) => (
        <li key={league.id}>
          <PrivateLeagueCard
            id={league.id}
            name={league.name}
            leagueType={league.league_type === 'run' ? 'run' : 'engine'}
            memberCount={memberCount}
            inviteCode={league.invite_code}
            conversationId={league.conversation_id}
            imageUrl={league.image_url}
            description={league.description}
            onAddFriend={() => setInviteLeague(league)}
          />
        </li>
      ))}
    </ul>
  );

  const content = (
    <section className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between gap-3">
        {!embedded ? (
          <h1 className="type-page-title">Clubs</h1>
        ) : (
          <h2 className="type-card-title">Clubs</h2>
        )}
        {athleteId ? <CreateLeagueModal athleteId={athleteId} onCreated={() => void load()} /> : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : leagues.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No clubs yet. Create private and public clubs in social tab.
        </p>
      ) : (
        <>
          <div className="flex rounded-xl bg-muted/90 p-1" role="tablist" aria-label="Club visibility">
            <button
              type="button"
              role="tab"
              aria-selected={clubTab === 'private'}
              onClick={() => {
                haptic('light');
                setClubTab('private');
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                clubTab === 'private'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Lock className="h-4 w-4 shrink-0" aria-hidden />
              Private
              {privateClubs.length > 0 ? (
                <span className="text-xs font-normal text-muted-foreground">({privateClubs.length})</span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={clubTab === 'public'}
              onClick={() => {
                haptic('light');
                setClubTab('public');
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                clubTab === 'public'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Globe className="h-4 w-4 shrink-0" aria-hidden />
              Public
              {publicClubs.length > 0 ? (
                <span className="text-xs font-normal text-muted-foreground">({publicClubs.length})</span>
              ) : null}
            </button>
          </div>

          {visibleClubs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {clubTab === 'public'
                ? 'No public clubs yet. Join one from Discover or create a public club.'
                : 'No private clubs yet. Create one or accept an invite link.'}
            </p>
          ) : (
            renderClubList(visibleClubs)
          )}
        </>
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
