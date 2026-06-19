import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { resolveAthleteExternalId } from '../_shared/athleteLookup.ts';
import { authenticateNotifyRequest, createServiceRoleClient, notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';
import { getOneSignalCredentials } from '../_shared/onesignalSend.ts';
import { outcomeFromOneSignal, sendOneSignalPush } from '../_shared/onesignalSend.ts';

function formatLeagueType(t: string): string {
  const s = t.trim();
  if (!s) return 'the leaderboard';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
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
      console.error('[notify-rank-change] missing service role key');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }
    if (!getOneSignalCredentials()) {
      console.error('[notify-rank-change] missing OneSignal credentials');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }

    let body: {
      athlete_id?: string;
      old_rank?: number;
      new_rank?: number;
      league_type?: string;
    };
    try {
      body = await req.json();
    } catch {
      return notifyJson({ error: 'Invalid JSON' }, 400);
    }

    const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
    const oldRank = typeof body.old_rank === 'number' && Number.isFinite(body.old_rank) ? body.old_rank : null;
    const newRank = typeof body.new_rank === 'number' && Number.isFinite(body.new_rank) ? body.new_rank : null;
    const leagueType = typeof body.league_type === 'string' ? body.league_type : '';

    if (!athleteId || oldRank === null || newRank === null) {
      return notifyJson({ error: 'athlete_id, old_rank, and new_rank are required' }, 400);
    }

    if (newRank === oldRank) {
      return notifyJson({ success: true, skipped: true, reason: 'rank unchanged' });
    }

    const externalUserId = await resolveAthleteExternalId(supabase, athleteId);
    if (!externalUserId) {
      return notifyJson({ success: false, error: 'Athlete not found' }, 404);
    }

    const lt = formatLeagueType(leagueType);
    let title: string;
    let message: string;

    if (newRank < oldRank) {
      title = 'You climbed the ranks! 🔥';
      message = `You moved up to #${newRank} in ${lt}!`;
    } else {
      title = "You've been overtaken 😤";
      message = `You dropped to #${newRank} in ${lt} — time to train!`;
    }

    const osResult = await sendOneSignalPush({
      externalUserIds: [externalUserId],
      title,
      message,
      path: '/app/leaderboard',
      appId: '',
    });

    const { httpStatus, payload } = outcomeFromOneSignal('notify-rank-change', osResult, {
      athleteId,
      externalUserId,
    });
    return notifyJson(payload, httpStatus);
  } catch (e) {
    console.error('[notify-rank-change]', e);
    return notifyJson({ success: false, error: 'Internal error' }, 500);
  }
});
