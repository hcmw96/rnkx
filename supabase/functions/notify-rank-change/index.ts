import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateNotifyRequest, notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';
import { getOneSignalApiKey, getOneSignalAppId } from '../_shared/onesignalEnv.ts';
import { buildOneSignalPayload } from '../_shared/onesignalPush.ts';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

function formatLeagueType(t: string): string {
  const s = t.trim();
  if (!s) return 'the leaderboard';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: notifyCorsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return notifyJson({ success: true });
    }

    const auth = await authenticateNotifyRequest(req);
    if (!auth) {
      return notifyJson({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appId = getOneSignalAppId();
    const apiKey = getOneSignalApiKey();

    if (!supabaseUrl || !serviceKey || !appId || !apiKey) {
      console.error('[notify-rank-change] missing env');
      return notifyJson({ success: true });
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
      return notifyJson({ success: true });
    }

    const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
    const oldRank = typeof body.old_rank === 'number' && Number.isFinite(body.old_rank) ? body.old_rank : null;
    const newRank = typeof body.new_rank === 'number' && Number.isFinite(body.new_rank) ? body.new_rank : null;
    const leagueType = typeof body.league_type === 'string' ? body.league_type : '';

    if (!athleteId || oldRank === null || newRank === null) {
      console.warn('[notify-rank-change] missing fields');
      return notifyJson({ success: true });
    }

    if (newRank === oldRank) {
      return notifyJson({ success: true });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: athlete, error: athErr } = await supabase
      .from('athletes')
      .select('id')
      .eq('id', athleteId)
      .maybeSingle();

    if (athErr) {
      console.error('[notify-rank-change] athlete lookup', athErr);
      return notifyJson({ success: true });
    }
    if (!athlete?.id) {
      console.warn('[notify-rank-change] unknown athlete', athleteId);
      return notifyJson({ success: true });
    }
    const externalUserId = String(athlete.id);

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

    const osRes = await fetch(ONESIGNAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(
        buildOneSignalPayload({
          appId,
          externalUserIds: [externalUserId],
          title,
          message,
          path: '/app/leaderboard',
        }),
      ),
    });

    const osJson = await osRes.json().catch(() => ({}));
    if (!osRes.ok) {
      console.error('[notify-rank-change] OneSignal', osRes.status, osJson);
    }
  } catch (e) {
    console.error('[notify-rank-change]', e);
  }

  return notifyJson({ success: true });
});
