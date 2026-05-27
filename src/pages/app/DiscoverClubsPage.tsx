import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { LeagueChevronLogo } from '@/components/leagues/LeagueChevronLogo';

type PublicClub = {
  id: string;
  name: string;
  image_url: string | null;
  league_type: string;
  conversation_id: string | null;
  memberCount: number;
  joined: boolean;
};

export default function DiscoverClubsPage() {
  const navigate = useNavigate();
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [clubs, setClubs] = useState<PublicClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setLoading(false);
      return;
    }

    const aid = await resolveAthleteId(uid);
    setAthleteId(aid);

    const { data: publicLeagues, error } = await supabase
      .from('private_leagues')
      .select('id, name, image_url, league_type, conversation_id')
      .eq('is_public', true)
      .order('name');

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const ids = (publicLeagues ?? []).map((l) => l.id as string);
    if (!ids.length) {
      setClubs([]);
      setLoading(false);
      return;
    }

    const [{ data: allMembers }, { data: myMemberships }] = await Promise.all([
      supabase.from('private_league_members').select('league_id').in('league_id', ids).eq('status', 'accepted'),
      aid
        ? supabase
            .from('private_league_members')
            .select('league_id')
            .in('league_id', ids)
            .eq('athlete_id', aid)
            .eq('status', 'accepted')
        : Promise.resolve({ data: [] }),
    ]);

    const countByLeague = new Map<string, number>();
    for (const row of allMembers ?? []) {
      const lid = row.league_id as string;
      countByLeague.set(lid, (countByLeague.get(lid) ?? 0) + 1);
    }

    const joinedSet = new Set((myMemberships ?? []).map((m) => m.league_id as string));

    setClubs(
      (publicLeagues ?? []).map((l) => ({
        id: l.id as string,
        name: l.name as string,
        image_url: l.image_url as string | null,
        league_type: l.league_type as string,
        conversation_id: l.conversation_id as string | null,
        memberCount: countByLeague.get(l.id as string) ?? 0,
        joined: joinedSet.has(l.id as string),
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleJoin = async (club: PublicClub) => {
    if (!athleteId || joining) return;
    if (club.joined) {
      navigate(`/app/leagues/${club.id}`);
      return;
    }
    setJoining(club.id);
    try {
      const { error: memErr } = await supabase.rpc('add_member_to_club', {
        p_league_id: club.id,
        p_athlete_id: athleteId,
      });

      if (memErr) {
        toast.error(memErr.message);
        return;
      }

      toast.success(`Joined ${club.name}`);
      setClubs((prev) => prev.map((c) => (c.id === club.id ? { ...c, joined: true, memberCount: c.memberCount + 1 } : c)));
    } finally {
      setJoining(null);
    }
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : clubs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No public clubs yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {clubs.map((club) => (
            <li key={club.id}>
              <div className="flex w-full items-center gap-3 rounded-xl border border-border/80 bg-[hsla(0,0%,10%,1)] p-3.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => navigate(`/app/leagues/${club.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full">
                    {club.image_url ? (
                      <img src={club.image_url} alt={club.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <LeagueChevronLogo className="h-11 w-11" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="type-card-title truncate">{club.name}</div>
                    <div className="type-meta">
                      {club.memberCount} member{club.memberCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={joining === club.id}
                  onClick={() => void handleJoin(club)}
                  className={
                    club.joined
                      ? 'shrink-0 rounded-full bg-muted px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70'
                      : 'shrink-0 rounded-full bg-muted px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 active:scale-95'
                  }
                >
                  {joining === club.id ? 'Joining…' : club.joined ? 'Joined' : 'Join'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
