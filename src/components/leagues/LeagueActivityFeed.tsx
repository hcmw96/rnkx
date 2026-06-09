import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { activitySessionScore } from '@/lib/activitySessionScore';
import { formatScorePts } from '@/lib/formatScore';
import { athleteAvatarDisplayUrl } from '@/lib/leagueAvatars';

interface FeedActivity {
  id: string;
  username: string;
  avatar_url: string | null;
  duration_minutes: number;
  sessionScore: number;
  activityDate: string;
}

interface LeagueActivityFeedProps {
  memberIds: string[];
  leagueType: string;
  seasonId: string | null;
}

export function LeagueActivityFeed({ memberIds, leagueType, seasonId }: LeagueActivityFeedProps) {
  const [activities, setActivities] = useState<FeedActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!memberIds.length || !seasonId) {
      setLoading(false);
      return;
    }

    async function load() {
      const { data } = await supabase
        .from('activities')
        .select(
          'id, athlete_id, duration_minutes, avg_hr_percent, avg_pace_seconds, league_type, activity_date, athletes(username, avatar_url)',
        )
        .eq('league_type', leagueType)
        .eq('season_id', seasonId)
        .eq('status', 'scored')
        .in('athlete_id', memberIds)
        .order('activity_date', { ascending: false })
        .limit(10);

      if (data) {
        const rows = data as unknown as {
          id: string;
          athlete_id: string;
          duration_minutes: number;
          avg_hr_percent: number | null;
          avg_pace_seconds: number | null;
          league_type: string;
          activity_date: string;
          athletes?: { username: string | null; avatar_url: string | null } | { username: string | null; avatar_url: string | null }[] | null;
        }[];
        setActivities(
          rows.map((a) => {
            const ath = Array.isArray(a.athletes) ? a.athletes[0] : a.athletes;
            return {
            id: a.id,
            username: ath?.username || 'Unknown',
            avatar_url: ath?.avatar_url ?? null,
            duration_minutes: Number(a.duration_minutes),
            sessionScore: activitySessionScore(
              a.league_type,
              Number(a.duration_minutes),
              a.avg_hr_percent != null ? Number(a.avg_hr_percent) : null,
              a.avg_pace_seconds != null ? Number(a.avg_pace_seconds) : null,
            ),
            activityDate: a.activity_date,
          };
          }),
        );
      }
      setLoading(false);
    }

    void load();
  }, [memberIds, leagueType, seasonId]);

  if (loading) {
    return (
      <div className="space-y-2">
        <h2 className="type-section-label px-1">Recent Activity</h2>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!activities.length) return null;

  return (
    <div className="space-y-2">
      <h2 className="type-section-label px-1">Recent Activity</h2>
      {activities.map((a) => {
        const avatarSrc = athleteAvatarDisplayUrl(a.avatar_url, leagueType);
        return (
        <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs font-medium text-muted-foreground">{a.username.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate type-heading">{a.username}</div>
            <div className="type-meta">
              {a.duration_minutes}min · {formatScorePts(a.sessionScore)}
            </div>
          </div>
          <div className="type-meta whitespace-nowrap">
            {formatDistanceToNow(new Date(`${a.activityDate}T12:00:00`), { addSuffix: true })}
          </div>
        </div>
      );
      })}
    </div>
  );
}
