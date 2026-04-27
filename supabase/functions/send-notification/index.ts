import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';
const DEFAULT_APP_URL = 'https://rnkx.netlify.app/app/dashboard';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim();

  if (!supabaseUrl || !serviceKey) {
    console.error('[send-notification] missing Supabase env');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500 });
  }
  if (!appId || !restApiKey) {
    console.error('[send-notification] missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500 });
  }

  let body: { athlete_id?: string; title?: string; message?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const url = typeof body.url === 'string' && body.url.trim() !== '' ? body.url.trim() : DEFAULT_APP_URL;

  if (!athleteId || !title || !message) {
    return new Response(JSON.stringify({ error: 'athlete_id, title, and message are required' }), { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: athlete, error: athErr } = await supabase.from('athletes').select('id').eq('id', athleteId).maybeSingle();
  if (athErr || !athlete) {
    return new Response(JSON.stringify({ error: 'Athlete not found' }), { status: 404 });
  }

  // Target subscriptions linked via OneSignal.login(athlete_id) on the client.
  const payload = {
    app_id: appId,
    include_external_user_ids: [athleteId],
    headings: { en: title },
    contents: { en: message },
    url,
  };

  const osRes = await fetch(ONESIGNAL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${restApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const osJson = (await osRes.json()) as Record<string, unknown>;
  if (!osRes.ok) {
    console.error('[send-notification] OneSignal error', osRes.status, osJson);
    return new Response(JSON.stringify({ success: false, error: osJson }), { status: 502 });
  }

  return new Response(JSON.stringify({ success: true, id: osJson.id ?? null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
