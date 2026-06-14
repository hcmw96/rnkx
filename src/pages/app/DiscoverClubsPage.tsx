import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invokePushNotify } from '@/lib/pushNotify';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { clubImageDisplayUrl } from '@/lib/clubImageUpload';
import { ClubGenderChip } from '@/components/leagues/ClubGenderChip';
import {
  athleteCanJoinClub,
  clubGenderJoinMessage,
  normalizeClubGender,
} from '@/lib/clubGender';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { LeagueChevronLogo } from '@/components/leagues/LeagueChevronLogo';
import { leagueCardBorderClass } from '@/components/leagues/PrivateLeagueCard';
import { cn } from '@/lib/utils';

type PublicClub = {
  id: string;
  name: string;
  created_by: string;
  image_url: string | null;
  league_type: string;
  gender: string;
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
  const [myGender, setMyGender] = useState<string | null>(null);

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

    if (aid) {
      const { data: me } = await supabase.from('athletes').select('gender').eq('id', aid).maybeSingle();
      setMyGender((me?.gender as string | null) ?? null);
    }

    const { data: publicLeagues, error } = await supabase
      .from('private_leagues')
      .select('id, name, created_by, image_url, league_type, gender, conversation_id')
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
        created_by: l.created_by as string,
        image_url: l.image_url as string | null,
        league_type: l.league_type as string,
        gender: (l.gender as string | null) ?? 'mixed',
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

    const clubGender = normalizeClubGender(club.gender);
    if (!athleteCanJoinClub(clubGender, myGender)) {
      toast.error(clubGenderJoinMessage(clubGender));
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

      if (club.created_by !== athleteId) {
        invokePushNotify('send-notification', {
          athlete_id: club.created_by,
          title: 'New club member',
          message: `Someone joined ${club.name}.`,
          path: `/app/leagues/${club.id}`,
        });
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
          {clubs.map((club) => {
            const clubImageSrc = clubImageDisplayUrl(club.image_url, {
              cacheKey: club.id,
              leagueType: club.league_type,
            });
            return (
            <li key={club.id}>
              <div
                className={cn(
                  'flex items-center gap-2 rounded-lg border bg-[hsla(0,0%,10%,1)] px-2.5 py-2 shadow-sm',
                  leagueCardBorderClass(club.league_type === 'run' ? 'run' : 'engine'),
                )}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/app/leagues/${club.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/80 bg-[hsla(0,0%,14%,1)]">
                    {clubImageSrc ? (
                      <img
                        src={clubImageSrc}
                        alt={club.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <LeagueChevronLogo className="h-full w-full" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="type-heading truncate">{club.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
                      <ClubGenderChip gender={club.gender} />
                    </div>
                    <p className="type-meta mt-0.5">
                      {club.memberCount} member{club.memberCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={joining === club.id}
                  onClick={() => void handleJoin(club)}
                  className={
                    club.joined
                      ? 'shrink-0 rounded-full bg-muted px-3.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70'
                      : 'shrink-0 rounded-full bg-muted px-3.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted/70 active:scale-95'
                  }
                >
                  {joining === club.id ? 'Joining…' : club.joined ? 'Joined' : 'Join'}
                </button>
              </div>
            </li>
          );
          })}
        </ul>
      )}
    </div>
  );
}
