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
      console.error('[notify-friend-request] missing env');
      return json({ success: true });
    }

    let body: { from_athlete_id?: string; to_athlete_id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ success: true });
    }

    const fromId = typeof body.from_athlete_id === 'string' ? body.from_athlete_id.trim() : '';
    const toId = typeof body.to_athlete_id === 'string' ? body.to_athlete_id.trim() : '';

    if (!fromId || !toId) {
      console.warn('[notify-friend-request] missing from_athlete_id or to_athlete_id');
      return json({ success: true });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const [fromRes, toRes] = await Promise.all([
      supabase.from('athletes').select('user_id, username').eq('id', fromId).maybeSingle(),
      supabase.from('athletes').select('user_id, username').eq('id', toId).maybeSingle(),
    ]);

    if (fromRes.error) console.error('[notify-friend-request] from athlete', fromRes.error);
    if (toRes.error) console.error('[notify-friend-request] to athlete', toRes.error);

    const toUserId = toRes.data?.user_id ? String(toRes.data.user_id) : '';
    if (!toUserId) {
      console.warn('[notify-friend-request] no user_id for recipient', toId);
      return json({ success: true });
    }

    const fromUsername = sanitize(
      (fromRes.data?.username as string | undefined) || 'Someone',
      80,
    );

    const title = 'New friend request 👋';
    const message = `${fromUsername} wants to be your friend on RNKX`;

    const osRes = await fetch(ONESIGNAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: [toUserId],
        headings: { en: title },
        contents: { en: message },
        url: SOCIAL_URL,
      }),
    });

    const osJson = await osRes.json().catch(() => ({}));
    if (!osRes.ok) {
      console.error('[notify-friend-request] OneSignal', osRes.status, osJson);
    }
  } catch (e) {
    console.error('[notify-friend-request]', e);
  }

  return json({ success: true });
});
