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
      console.error('[notify-new-message] missing env');
      return json({ success: true });
    }

    let body: {
      receiver_athlete_id?: string;
      sender_name?: string;
      preview?: string;
    };
    try {
      body = await req.json();
    } catch {
      return json({ success: true });
    }

    const receiverAthleteId =
      typeof body.receiver_athlete_id === 'string' ? body.receiver_athlete_id.trim() : '';
    const senderName = typeof body.sender_name === 'string' ? body.sender_name.trim() : 'Someone';
    const preview = typeof body.preview === 'string' ? body.preview.trim() : '';

    if (!receiverAthleteId) {
      console.warn('[notify-new-message] missing receiver_athlete_id');
      return json({ success: true });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: athlete, error: athErr } = await supabase
      .from('athletes')
      .select('id')
      .eq('id', receiverAthleteId)
      .maybeSingle();

    if (athErr) {
      console.error('[notify-new-message] athlete lookup', athErr);
      return json({ success: true });
    }

    if (!athlete?.id) {
      console.warn('[notify-new-message] unknown receiver athlete', receiverAthleteId);
      return json({ success: true });
    }
    const externalUserId = String(athlete.id);

    const title = `${sanitize(senderName, 60)} 💬`;
    const message = sanitize(preview || 'New message', 200);

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
        url: SOCIAL_URL,
      }),
    });

    const osJson = await osRes.json().catch(() => ({}));
    if (!osRes.ok) {
      console.error('[notify-new-message] OneSignal', osRes.status, osJson);
    }
  } catch (e) {
    console.error('[notify-new-message]', e);
  }

  return json({ success: true });
});
