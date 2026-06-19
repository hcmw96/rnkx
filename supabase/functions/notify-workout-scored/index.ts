import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { resolveAthleteExternalId } from '../_shared/athleteLookup.ts';
import { authenticateNotifyRequest, createServiceRoleClient, notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';
import { getOneSignalCredentials } from '../_shared/onesignalSend.ts';
import { outcomeFromOneSignal, sendOneSignalPush } from '../_shared/onesignalSend.ts';

function formatLeagueType(t: string): string {
  const s = t.trim();
  if (!s) return 'workout';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function leagueCategory(leagueType: string): string {
  const s = leagueType.trim().toLowerCase();
  return s === 'run' ? 'run' : 'engine';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: notifyCorsHeaders });
  }
  if (req.method !== 'POST') {
    return notifyJson({ error: 'Method not allowed' }, 405);
  }

  try {
    const auth = await authenticateNotifyRequest(req);
    if (!auth) {
      return notifyJson({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      console.error('[notify-workout-scored] missing service role key');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }
    if (!getOneSignalCredentials()) {
      console.error('[notify-workout-scored] missing OneSignal credentials');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }

    let body: {
      athlete_id?: string;
      score?: number;
      league_type?: string;
      rank?: number;
    };
    try {
      body = await req.json();
    } catch {
      return notifyJson({ error: 'Invalid JSON' }, 400);
    }

    const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
    const score = typeof body.score === 'number' && Number.isFinite(body.score) ? body.score : null;
    const leagueType = typeof body.league_type === 'string' ? body.league_type : 'workout';
    let rank = typeof body.rank === 'number' && Number.isFinite(body.rank) ? body.rank : null;

    if (!athleteId || score === null) {
      return notifyJson({ error: 'athlete_id and score are required' }, 400);
    }

    if (auth.kind === 'user' && auth.athleteId !== athleteId) {
      return notifyJson({ success: false, error: 'Forbidden' }, 403);
    }

    const externalUserId = await resolveAthleteExternalId(supabase, athleteId);
    if (!externalUserId) {
      return notifyJson({ success: false, error: 'Athlete not found' }, 404);
    }

    if (rank === null) {
      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();
      if (season?.id) {
        const { data: rankData, error: rankErr } = await supabase.rpc('category_leaderboard_rank', {
          p_athlete_id: externalUserId,
          p_season_id: season.id,
          p_category: leagueCategory(leagueType),
        });
        if (!rankErr && rankData != null && Number.isFinite(Number(rankData))) {
          const n = Number(rankData);
          rank = n >= 999999 ? null : n;
        }
      }
    }

    const lt = formatLeagueType(leagueType);
    const title = 'Workout scored! 💪';
    const message =
      rank != null && rank > 0
        ? `Your ${lt} workout scored ${score} pts — you're ranked #${rank}!`
        : `Your ${lt} workout scored ${score} pts!`;

    const osResult = await sendOneSignalPush({
      externalUserIds: [externalUserId],
      title,
      message,
      path: '/app',
      appId: '',
    });

    const { httpStatus, payload } = outcomeFromOneSignal('notify-workout-scored', osResult, {
      athleteId,
      externalUserId,
    });
    return notifyJson(payload, httpStatus);
  } catch (e) {
    console.error('[notify-workout-scored]', e);
    return notifyJson({ success: false, error: 'Internal error' }, 500);
  }
});
