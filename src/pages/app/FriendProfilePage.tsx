import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Check, MessageCircle, UserPlus, X } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { ProfileOverviewCard, ProfilePreviewCard } from '@/components/profile/ProfileSections';
import { Button } from '@/components/ui/button';
import { getCountryByName } from '@/data/countries';
import { fetchProfileSeasonStats, fetchSeasonStanding } from '@/lib/profileStats';
import { leagueFromSelectedLeagues } from '@/lib/leagueAvatars';
import { invokePushNotify } from '@/lib/pushNotify';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';

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

type FriendshipRelation =
  | { kind: 'accepted' }
  | { kind: 'none' }
  | { kind: 'pending_outgoing'; rowId: string }
  | { kind: 'pending_incoming'; rowId: string; requesterId: string };

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

async function getFriendshipRelation(myId: string, otherId: string): Promise<FriendshipRelation> {
  const { data } = await supabase
    .from('friendships')
    .select('id, athlete_id, friend_id, status')
    .or(
      `and(athlete_id.eq.${myId},friend_id.eq.${otherId}),and(athlete_id.eq.${otherId},friend_id.eq.${myId})`,
    )
    .limit(1)
    .maybeSingle();

  if (!data || data.status === 'declined') {
    return { kind: 'none' };
  }
  if (data.status === 'accepted') {
    return { kind: 'accepted' };
  }
  if (data.status === 'pending') {
    if (data.athlete_id === myId) {
      return { kind: 'pending_outgoing', rowId: data.id as string };
    }
    return {
      kind: 'pending_incoming',
      rowId: data.id as string,
      requesterId: data.athlete_id as string,
    };
  }
  return { kind: 'none' };
}

export default function FriendProfilePage() {
  const { athleteId: friendId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myAthleteId, setMyAthleteId] = useState<string | null>(null);
  const [friendship, setFriendship] = useState<FriendshipRelation>({ kind: 'none' });
  const [friend, setFriend] = useState<FriendAthlete | null>(null);
  const [seasonDisplay, setSeasonDisplay] = useState('Season 1 · Spring 2026');
  const [engineScore, setEngineScore] = useState(0);
  const [runScore, setRunScore] = useState(0);
  const [standingPercent, setStandingPercent] = useState(50);
  const [topPercent, setTopPercent] = useState(50);
  const [friendActionLoading, setFriendActionLoading] = useState(false);

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
      setError('Sign in to view profiles.');
      setLoading(false);
      return;
    }

    const myId = await resolveMyAthleteId(uid);
    if (!myId) {
      setError('Complete your profile first.');
      setLoading(false);
      return;
    }
    setMyAthleteId(myId);

    if (myId === friendId) {
      navigate('/app/profile', { replace: true });
      return;
    }

    const relation = await getFriendshipRelation(myId, friendId);
    setFriendship(relation);

    const [{ data: athlete, error: athleteErr }, season, standing] = await Promise.all([
      supabase
        .from('athletes')
        .select('id, username, display_name, avatar_url, country, total_score, created_at, is_premium, selected_leagues')
        .eq('id', friendId)
        .maybeSingle(),
      relation.kind === 'accepted' ? fetchProfileSeasonStats(friendId) : Promise.resolve(null),
      relation.kind === 'accepted' ? fetchSeasonStanding(friendId) : Promise.resolve(null),
    ]);

    if (athleteErr || !athlete) {
      setError(athleteErr?.message ?? 'Athlete not found.');
      setFriend(null);
      setLoading(false);
      return;
    }

    setFriend(athlete as FriendAthlete);
    if (season) {
      setSeasonDisplay(season.seasonDisplay);
      setEngineScore(season.engineScore);
      setRunScore(season.runScore);
    }
    if (standing) {
      setStandingPercent(standing.standingPercent);
      setTopPercent(standing.topPercent);
    }
    setLoading(false);
  }, [friendId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendRequest = async () => {
    if (!myAthleteId || !friendId || friendActionLoading) return;
    setFriendActionLoading(true);
    const { error: reqErr } = await supabase.from('friendships').upsert(
      {
        athlete_id: myAthleteId,
        friend_id: friendId,
        status: 'pending',
      },
      { onConflict: 'athlete_id,friend_id' },
    );
    setFriendActionLoading(false);
    if (reqErr) {
      if (reqErr.code === '23505') {
        toast.error('Friend request already exists.');
      } else {
        toast.error(reqErr.message);
      }
      return;
    }
    toast.success('Friend request sent.');
    invokePushNotify('notify-friend-request', {
      from_athlete_id: myAthleteId,
      to_athlete_id: friendId,
    });
    void load();
  };

  const respondToRequest = async (accept: boolean) => {
    if (friendship.kind !== 'pending_incoming' || friendActionLoading) return;
    setFriendActionLoading(true);
    const { error: respErr } = await supabase
      .from('friendships')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', friendship.rowId);
    setFriendActionLoading(false);
    if (respErr) {
      toast.error(respErr.message);
      return;
    }
    toast.success(accept ? 'Friend added.' : 'Request declined.');
    if (accept && myAthleteId && friendship.requesterId) {
      invokePushNotify('send-notification', {
        athlete_id: friendship.requesterId,
        title: 'Friend request accepted',
        message: `${friend?.display_name || friend?.username || 'Someone'} accepted your friend request.`,
        path: '/app/social/friends',
      });
    }
    void load();
  };

  const displayName = friend?.display_name?.trim() || friend?.username || 'Athlete';
  const countryMeta = friend?.country ? getCountryByName(friend.country) : null;
  const countryName = countryMeta?.name ?? friend?.country ?? null;
  const countryFlag = countryMeta?.flag ?? '';
  const avatarLeague = leagueFromSelectedLeagues(friend?.selected_leagues);
  const combinedScore = engineScore + runScore;
  const isAcceptedFriend = friendship.kind === 'accepted';

  const identityProps = {
    displayName,
    username: friend?.username ?? null,
    isPremium: friend?.is_premium ?? null,
    countryName,
    countryFlag,
    memberSince: memberSinceLabel(friend?.created_at),
    avatarUrl: friend?.avatar_url ?? null,
    avatarLeague,
  };

  return (
    <AppShell>
      <section className="mx-auto max-w-lg space-y-4 pb-8">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {isAcceptedFriend && friendId ? (
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
          <div className="space-y-4">
            {isAcceptedFriend ? (
              <ProfileOverviewCard
                {...identityProps}
                seasonDisplay={seasonDisplay}
                combinedScore={combinedScore}
                engineScore={engineScore}
                runScore={runScore}
                standingPercent={standingPercent}
                topPercent={topPercent}
              />
            ) : (
              <>
                <ProfilePreviewCard {...identityProps} />
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  {friendship.kind === 'none' ? (
                    <Button
                      type="button"
                      className="w-full gap-2 bg-neon-lime text-black hover:bg-neon-lime/90"
                      disabled={friendActionLoading}
                      onClick={() => void sendRequest()}
                    >
                      <UserPlus className="h-4 w-4" />
                      Add friend
                    </Button>
                  ) : null}
                  {friendship.kind === 'pending_outgoing' ? (
                    <Button type="button" variant="secondary" className="w-full" disabled>
                      Friend request sent
                    </Button>
                  ) : null}
                  {friendship.kind === 'pending_incoming' ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        className="flex-1 gap-1.5 bg-neon-lime text-black hover:bg-neon-lime/90"
                        disabled={friendActionLoading}
                        onClick={() => void respondToRequest(true)}
                      >
                        <Check className="h-4 w-4" />
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 gap-1.5"
                        disabled={friendActionLoading}
                        onClick={() => void respondToRequest(false)}
                      >
                        <X className="h-4 w-4" />
                        Decline
                      </Button>
                    </div>
                  ) : null}
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    Add as a friend to see their full season stats and message them.
                  </p>
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
