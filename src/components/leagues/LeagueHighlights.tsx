import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { Trophy, Flame, Zap } from 'lucide-react';
import { startOfWeek } from 'date-fns';
import { activitySessionScore } from '@/lib/activitySessionScore';

interface Highlight {
  label: string;
  username: string;
  value: string;
  icon: React.ReactNode;
}

interface LeagueHighlightsProps {
  memberIds: string[];
  leagueType: string;
  seasonId: string | null;
}

export function LeagueHighlights({ memberIds, leagueType, seasonId }: LeagueHighlightsProps) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    if (!memberIds.length || !seasonId) return;

    async function load() {
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split('T')[0];

      const { data } = await supabase
        .from('activities')
        .select('athlete_id, duration_minutes, avg_hr_percent, avg_pace_seconds, league_type, athletes(username)')
        .eq('league_type', leagueType)
        .eq('season_id', seasonId)
        .eq('status', 'scored')
        .in('athlete_id', memberIds)
        .gte('activity_date', weekStart);

      if (!data || data.length === 0) return;

      const rows = data as unknown as {
        athlete_id: string;
        duration_minutes: number;
        avg_hr_percent: number | null;
        avg_pace_seconds: number | null;
        league_type: string;
        athletes?: { username: string | null } | { username: string | null }[] | null;
      }[];

      const perAthlete: Record<
        string,
        { username: string; totalScore: number; count: number; bestSession: number }
      > = {};
      for (const a of rows) {
        const id = a.athlete_id;
        const ath = Array.isArray(a.athletes) ? a.athletes[0] : a.athletes;
        if (!perAthlete[id]) {
          perAthlete[id] = { username: ath?.username || 'Unknown', totalScore: 0, count: 0, bestSession: 0 };
        }
        const session = activitySessionScore(
          a.league_type,
          Number(a.duration_minutes),
          a.avg_hr_percent != null ? Number(a.avg_hr_percent) : null,
          a.avg_pace_seconds != null ? Number(a.avg_pace_seconds) : null,
        );
        perAthlete[id].totalScore += session;
        perAthlete[id].count += 1;
        perAthlete[id].bestSession = Math.max(perAthlete[id].bestSession, session);
      }

      const entries = Object.values(perAthlete);
      const topScorer = entries.sort((a, b) => b.totalScore - a.totalScore)[0];
      const mostConsistent = entries.sort((a, b) => b.count - a.count)[0];

      let bestSessionAthlete = entries[0];
      for (const e of entries) {
        if (e.bestSession > bestSessionAthlete.bestSession) bestSessionAthlete = e;
      }

      const result: Highlight[] = [];
      if (topScorer) {
        result.push({
          label: 'Top Scorer',
          username: topScorer.username,
          value: `${topScorer.totalScore.toLocaleString()} pts`,
          icon: <Trophy className="h-4 w-4 text-yellow-500" />,
        });
      }
      if (mostConsistent && mostConsistent.count > 1) {
        result.push({
          label: 'Most Active',
          username: mostConsistent.username,
          value: `${mostConsistent.count} sessions`,
          icon: <Flame className="h-4 w-4 text-orange-500" />,
        });
      }
      if (bestSessionAthlete) {
        result.push({
          label: 'Best Session',
          username: bestSessionAthlete.username,
          value: `${bestSessionAthlete.bestSession.toLocaleString()} pts`,
          icon: <Zap className="h-4 w-4 text-blue-500" />,
        });
      }

      setHighlights(result);
    }

    void load();
  }, [memberIds, leagueType, seasonId]);

  if (!highlights.length) return null;

  return (
    <div className="space-y-2">
      <h2 className="font-display px-1 text-sm uppercase tracking-wider text-muted-foreground">This Week</h2>
      <div className="grid grid-cols-3 gap-2">
        {highlights.map((h) => (
          <div key={h.label} className="space-y-1 rounded-lg border border-border bg-card p-3 text-center">
            <div className="flex items-center justify-center">{h.icon}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{h.label}</div>
            <div className="truncate text-xs font-medium text-foreground">{h.username}</div>
            <div className="font-display text-xs text-primary">{h.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
