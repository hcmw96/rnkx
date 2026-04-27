import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';
const LEADERBOARD_URL = 'https://rnkx.netlify.app/app/leaderboard';

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
  if (!s) return 'the leaderboard';
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
      console.error('[notify-rank-change] missing env');
      return json({ success: true });
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
      return json({ success: true });
    }

    const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
    const oldRank = typeof body.old_rank === 'number' && Number.isFinite(body.old_rank) ? body.old_rank : null;
    const newRank = typeof body.new_rank === 'number' && Number.isFinite(body.new_rank) ? body.new_rank : null;
    const leagueType = typeof body.league_type === 'string' ? body.league_type : '';

    if (!athleteId || oldRank === null || newRank === null) {
      console.warn('[notify-rank-change] missing fields');
      return json({ success: true });
    }

    if (newRank === oldRank) {
      return json({ success: true });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: athlete, error: athErr } = await supabase
      .from('athletes')
      .select('user_id')
      .eq('id', athleteId)
      .maybeSingle();

    if (athErr) {
      console.error('[notify-rank-change] athlete lookup', athErr);
      return json({ success: true });
    }
    const externalUserId = athlete?.user_id ? String(athlete.user_id) : '';
    if (!externalUserId) {
      console.warn('[notify-rank-change] no user_id for athlete', athleteId);
      return json({ success: true });
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

    const osRes = await fetch(ONESIGNAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [externalUserId],
        headings: { en: title },
        contents: { en: message },
        url: LEADERBOARD_URL,
      }),
    });

    const osJson = await osRes.json().catch(() => ({}));
    if (!osRes.ok) {
      console.error('[notify-rank-change] OneSignal', osRes.status, osJson);
    }
  } catch (e) {
    console.error('[notify-rank-change]', e);
  }

  return json({ success: true });
});
