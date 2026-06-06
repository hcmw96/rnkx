import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildOneSignalPayload } from '../_shared/onesignalPush.ts';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function formatLeagueType(t: string): string {
  const s = t.trim();
  if (!s) return 'workout';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return json({ success: true });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
    const apiKey = Deno.env.get('ONESIGNAL_API_KEY')?.trim();

    if (!supabaseUrl || !serviceKey || !appId || !apiKey) {
      console.error('[notify-workout-scored] missing env (SUPABASE_URL, SERVICE_ROLE, ONESIGNAL_APP_ID, ONESIGNAL_API_KEY)');
      return json({ success: true });
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
      return json({ success: true });
    }

    const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
    const score = typeof body.score === 'number' && Number.isFinite(body.score) ? body.score : null;
    const leagueType = typeof body.league_type === 'string' ? body.league_type : 'workout';
    const rank = typeof body.rank === 'number' && Number.isFinite(body.rank) ? body.rank : null;

    if (!athleteId || score === null || rank === null) {
      console.warn('[notify-workout-scored] missing athlete_id, score, or rank');
      return json({ success: true });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: athlete, error: athErr } = await supabase
      .from('athletes')
      .select('id')
      .eq('id', athleteId)
      .maybeSingle();

    if (athErr) {
      console.error('[notify-workout-scored] athlete lookup', athErr);
      return json({ success: true });
    }
    if (!athlete?.id) {
      console.warn('[notify-workout-scored] unknown athlete', athleteId);
      return json({ success: true });
    }
    const externalUserId = String(athlete.id);

    const lt = formatLeagueType(leagueType);
    const title = 'Workout scored! 💪';
    const message = `Your ${lt} workout scored ${score} pts — you're ranked #${rank}!`;

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
          path: '/app',
        }),
      ),
    });

    const osJson = await osRes.json().catch(() => ({}));
    const errors = (osJson as { errors?: unknown }).errors ?? null;
    console.log('[notify-workout-scored] onesignal result', {
      athleteId,
      externalUserId,
      status: osRes.status,
      ok: osRes.ok,
      oneSignalId: (osJson as { id?: unknown }).id ?? null,
      errors,
    });
    if (!osRes.ok) {
      console.error('[notify-workout-scored] OneSignal', osRes.status, osJson);
    } else if (errors) {
      console.warn('[notify-workout-scored] OneSignal delivered with errors (device may be unsubscribed)', {
        externalUserId,
        errors,
      });
    }
  } catch (e) {
    console.error('[notify-workout-scored]', e);
  }

  return json({ success: true });
});
