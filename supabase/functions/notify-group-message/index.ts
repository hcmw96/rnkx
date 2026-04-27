import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';
const SOCIAL_URL = 'https://rnkx.netlify.app/app/social';

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

function sanitize(s: string, max: number): string {
  const t = s.replace(/[\r\n\u0000]/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
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
      console.error('[notify-group-message] missing env');
      return json({ success: true });
    }

    let body: {
      league_id?: string;
      sender_athlete_id?: string;
      sender_name?: string;
      preview?: string;
    };
    try {
      body = await req.json();
    } catch {
      return json({ success: true });
    }

    const leagueId = typeof body.league_id === 'string' ? body.league_id.trim() : '';
    const senderAthleteId =
      typeof body.sender_athlete_id === 'string' ? body.sender_athlete_id.trim() : '';
    const senderName = typeof body.sender_name === 'string' ? body.sender_name.trim() : 'Someone';
    const preview = typeof body.preview === 'string' ? body.preview.trim() : '';

    if (!leagueId || !senderAthleteId) {
      console.warn('[notify-group-message] missing league_id or sender_athlete_id');
      return json({ success: true });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: leagueRow, error: leagueErr } = await supabase
      .from('private_leagues')
      .select('name')
      .eq('id', leagueId)
      .maybeSingle();

    if (leagueErr) {
      console.error('[notify-group-message] league lookup', leagueErr);
      return json({ success: true });
    }

    const leagueName = sanitize((leagueRow?.name as string | undefined) || 'League', 80);

    const { data: members, error: memErr } = await supabase
      .from('private_league_members')
      .select('athlete_id')
      .eq('league_id', leagueId)
      .eq('status', 'accepted');

    if (memErr) {
      console.error('[notify-group-message] members query', memErr);
      return json({ success: true });
    }

    const recipientAthleteIds = (members || [])
      .map((m: { athlete_id: string }) => m.athlete_id)
      .filter((id: string) => id && id !== senderAthleteId);

    if (recipientAthleteIds.length === 0) {
      return json({ success: true });
    }

    const externalUserIds = [...new Set(recipientAthleteIds.map((id: string) => String(id)))];

    const safeSender = sanitize(senderName, 60);
    const safePreview = sanitize(preview || 'Message', 180);
    const title = `${leagueName} 💬`;
    const message = `${safeSender}: ${safePreview}`;

    const osRes = await fetch(ONESIGNAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: externalUserIds,
        headings: { en: title },
        contents: { en: message },
        url: SOCIAL_URL,
      }),
    });

    const osJson = await osRes.json().catch(() => ({}));
    if (!osRes.ok) {
      console.error('[notify-group-message] OneSignal', osRes.status, osJson);
    }
  } catch (e) {
    console.error('[notify-group-message]', e);
  }

  return json({ success: true });
});
