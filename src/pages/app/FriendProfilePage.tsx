import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { activitySessionScore } from '@/lib/activitySessionScore';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';

interface FriendAthlete {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  country: string | null;
  total_score: number | null;
  profile_public: boolean | null;
}

interface FriendActivity {
  id: string;
  activity_type: string | null;
  league_type: string;
  activity_date: string;
  duration_minutes: number | null;
  avg_hr_percent: number | null;
  avg_pace_seconds: number | null;
}

function activityLabel(activityType: string | null, leagueType: string): string {
  const value = String(activityType ?? '').toLowerCase();
  if (value.includes('run')) return 'Running';
  if (value.includes('strength')) return 'Strength';
  if (leagueType === 'run') return 'Running';
  return 'Engine';
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
  const [rank, setRank] = useState<number | null>(null);
  const [activities, setActivities] = useState<FriendActivity[]>([]);

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

    const [{ data: athlete, error: athleteErr }, { data: lb }] = await Promise.all([
      supabase
        .from('athletes')
        .select('id, username, display_name, avatar_url, country, total_score, profile_public')
        .eq('id', friendId)
        .maybeSingle(),
      supabase.from('leaderboard').select('rank, total_score').eq('id', friendId).maybeSingle(),
    ]);

    if (athleteErr || !athlete) {
      setError(athleteErr?.message ?? 'Athlete not found.');
      setFriend(null);
      setActivities([]);
      setLoading(false);
      return;
    }

    setFriend(athlete as FriendAthlete);
    setRank(lb?.rank != null ? Number(lb.rank) : null);

    const profilePublic = athlete.profile_public ?? true;
    if (!profilePublic) {
      setActivities([]);
      setLoading(false);
      return;
    }

    const { data: rows, error: actErr } = await supabase
      .from('activities')
      .select(
        'id,activity_type,league_type,activity_date,duration_minutes,avg_hr_percent,avg_pace_seconds',
      )
      .eq('athlete_id', friendId)
      .eq('status', 'scored')
      .order('workout_start_time', { ascending: false, nullsFirst: false })
      .order('activity_date', { ascending: false })
      .limit(25);

    if (actErr) {
      setError(actErr.message);
      setActivities([]);
    } else {
      setActivities((rows as FriendActivity[] | null) ?? []);
    }

    setLoading(false);
  }, [friendId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName = friend?.display_name?.trim() || friend?.username || 'Athlete';
  const initial = displayName.charAt(0).toUpperCase() || '?';
  const totalScore =
    friend?.total_score != null ? Math.round(Number(friend.total_score)) : null;

  return (
    <AppShell>
      <section className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" className="shrink-0" asChild>
            <Link to="/app/friends" aria-label="Back to friends">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="type-page-title min-w-0 flex-1 truncate">{displayName}</h1>
          {friendId ? (
            <Button type="button" size="sm" className="shrink-0 gap-1.5 bg-neon-lime text-black hover:bg-neon-lime/90" asChild>
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
          <>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border/80 bg-muted">
                {friend.avatar_url ? (
                  <img src={friend.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                    {initial}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="type-heading truncate">{displayName}</p>
                <p className="type-meta truncate">{friend.username ?? '—'}</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-4">
                  <span className="type-meta">
                    Rank <span className="type-stat text-foreground">{rank != null ? `#${rank}` : '—'}</span>
                  </span>
                  {totalScore != null ? (
                    <span className="type-meta">
                      Score <span className="type-stat text-primary">{totalScore.toLocaleString()}</span>
                      <span className="type-stat-unit ml-1">pts</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="type-section-label">Workout history</h2>
              {friend.profile_public === false ? (
                <p className="mt-3 text-sm text-muted-foreground">This athlete keeps their profile private.</p>
              ) : !activities.length ? (
                <p className="mt-3 text-sm text-muted-foreground">No scored workouts yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {activities.map((activity) => {
                    const leagueType = activity.league_type === 'run' ? 'run' : 'engine';
                    const duration = Math.max(0, Number(activity.duration_minutes ?? 0));
                    const score = activitySessionScore(
                      leagueType,
                      duration,
                      activity.avg_hr_percent != null ? Number(activity.avg_hr_percent) : null,
                      activity.avg_pace_seconds != null ? Number(activity.avg_pace_seconds) : null,
                    );
                    return (
                      <li
                        key={activity.id}
                        className="flex items-center justify-between rounded-lg border border-border/60 bg-zinc-950/40 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="type-heading truncate">{activityLabel(activity.activity_type, leagueType)}</p>
                          <p className="type-meta mt-0.5">
                            {new Date(`${activity.activity_date}T12:00:00`).toLocaleDateString()} · {duration}{' '}
                            min
                          </p>
                        </div>
                        <div className="ml-3 shrink-0 pr-2 text-right">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
                              leagueType === 'run'
                                ? 'bg-cyan-500/15 text-cyan-300'
                                : 'bg-orange-500/15 text-orange-300',
                            )}
                          >
                            {leagueType === 'run' ? 'Run' : 'Engine'}
                          </span>
                          <p
                            className={cn(
                              'type-stat mt-1',
                              leagueType === 'run' ? 'text-secondary' : 'text-primary',
                            )}
                          >
                            {score.toLocaleString()}
                          </p>
                          <p className="type-stat-unit">pts</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
