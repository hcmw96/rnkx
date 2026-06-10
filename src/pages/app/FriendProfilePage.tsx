import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { ProfileOverviewCard } from '@/components/profile/ProfileSections';
import { Button } from '@/components/ui/button';
import { getCountryByName } from '@/data/countries';
import { fetchProfileSeasonStats, fetchSeasonStanding } from '@/lib/profileStats';
import { leagueFromSelectedLeagues } from '@/lib/leagueAvatars';
import { supabase } from '@/services/supabase';

interface FriendAthlete {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  country: string | null;
  total_score: number | null;
  created_at: string | null;
  is_premium: boolean | null;
  selected_leagues: string[] | null;
}

function memberSinceLabel(createdAt: string | null | undefined): string {
  if (!createdAt) return 'Member since —';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return 'Member since —';
  return `Member since ${format(d, 'MMMM yyyy')}`;
}

async function resolveMyAthleteId(uid: string): Promise<string | undefined> {
  const [byUserId, byId] = await Promise.all([
    supabase.from('athletes').select('id').eq('user_id', uid).not('username', 'is', null).maybeSingle(),
    supabase.from('athletes').select('id').eq('id', uid).not('username', 'is', null).maybeSingle(),
  ]);
  return (byUserId.data?.id ?? byId.data?.id) as string | undefined;
}

async function isAcceptedFriend(myId: string, friendId: string): Promise<boolean> {
  const { data } = await supabase
    .from('friendships')
    .select('athlete_id, friend_id')
    .eq('status', 'accepted')
    .or(`athlete_id.eq.${myId},friend_id.eq.${myId}`);
  return (data ?? []).some(
    (row) =>
      (row.athlete_id === myId && row.friend_id === friendId) ||
      (row.athlete_id === friendId && row.friend_id === myId),
  );
}

export default function FriendProfilePage() {
  const { athleteId: friendId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friend, setFriend] = useState<FriendAthlete | null>(null);
  const [seasonDisplay, setSeasonDisplay] = useState('Season 1 · Spring 2026');
  const [engineScore, setEngineScore] = useState(0);
  const [runScore, setRunScore] = useState(0);
  const [standingPercent, setStandingPercent] = useState(50);
  const [topPercent, setTopPercent] = useState(50);

  const load = useCallback(async () => {
    if (!friendId) {
      setError('Invalid profile link.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setError('Sign in to view friend profiles.');
      setLoading(false);
      return;
    }

    const myId = await resolveMyAthleteId(uid);
    if (!myId) {
      setError('Complete your profile first.');
      setLoading(false);
      return;
    }

    if (myId === friendId) {
      navigate('/app/profile', { replace: true });
      return;
    }

    const friends = await isAcceptedFriend(myId, friendId);
    if (!friends) {
      setError('You can only view profiles of accepted friends.');
      setLoading(false);
      return;
    }

    const [{ data: athlete, error: athleteErr }, season, standing] = await Promise.all([
      supabase
        .from('athletes')
        .select('id, username, display_name, avatar_url, country, total_score, created_at, is_premium, selected_leagues')
        .eq('id', friendId)
        .maybeSingle(),
      fetchProfileSeasonStats(friendId),
      fetchSeasonStanding(friendId),
    ]);

    if (athleteErr || !athlete) {
      setError(athleteErr?.message ?? 'Athlete not found.');
      setFriend(null);
      setLoading(false);
      return;
    }

    setFriend(athlete as FriendAthlete);
    setSeasonDisplay(season.seasonDisplay);
    setEngineScore(season.engineScore);
    setRunScore(season.runScore);
    setStandingPercent(standing.standingPercent);
    setTopPercent(standing.topPercent);
    setLoading(false);
  }, [friendId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName = friend?.display_name?.trim() || friend?.username || 'Athlete';
  const countryMeta = friend?.country ? getCountryByName(friend.country) : null;
  const countryName = countryMeta?.name ?? friend?.country ?? null;
  const countryFlag = countryMeta?.flag ?? '';
  const avatarLeague = leagueFromSelectedLeagues(friend?.selected_leagues);
  const combinedScore = engineScore + runScore;

  return (
    <AppShell>
      <section className="mx-auto max-w-lg space-y-4 pb-8">
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="icon" className="shrink-0" asChild>
            <Link to="/app/friends" aria-label="Back to friends">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          {friendId ? (
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-1.5 bg-neon-lime text-black hover:bg-neon-lime/90"
              asChild
            >
              <Link to={`/app/chat/${friendId}`}>
                <MessageCircle className="h-4 w-4" />
                Message
              </Link>
            </Button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        ) : error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : friend ? (
          <ProfileOverviewCard
            displayName={displayName}
            username={friend.username}
            isPremium={friend.is_premium}
            countryName={countryName}
            countryFlag={countryFlag}
            memberSince={memberSinceLabel(friend.created_at)}
            avatarUrl={friend.avatar_url}
            avatarLeague={avatarLeague}
            seasonDisplay={seasonDisplay}
            combinedScore={combinedScore}
            engineScore={engineScore}
            runScore={runScore}
            standingPercent={standingPercent}
            topPercent={topPercent}
          />
        ) : null}
      </section>
    </AppShell>
  );
}
