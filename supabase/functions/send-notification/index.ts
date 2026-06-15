import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getOneSignalApiKey, getOneSignalAppId } from '../_shared/onesignalEnv.ts';
import { buildOneSignalPayload, pathFromUrl } from '../_shared/onesignalPush.ts';
import { authenticateNotifyRequest, notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: notifyCorsHeaders });
  }
  if (req.method !== 'POST') {
    return notifyJson({ error: 'Method not allowed' }, 405);
  }

  const auth = await authenticateNotifyRequest(req);
  if (!auth) {
    return notifyJson({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appId = getOneSignalAppId();
  const restApiKey = getOneSignalApiKey();

  if (!supabaseUrl || !serviceKey) {
    console.error('[send-notification] missing Supabase env');
    return notifyJson({ error: 'Server misconfiguration' }, 500);
  }
  if (!appId || !restApiKey) {
    console.error('[send-notification] missing OneSignal credentials');
    return notifyJson({ error: 'Server misconfiguration' }, 500);
  }

  let body: { athlete_id?: string; title?: string; message?: string; url?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return notifyJson({ error: 'Invalid JSON' }, 400);
  }

  const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const path =
    typeof body.path === 'string' && body.path.trim() !== ''
      ? body.path.trim()
      : typeof body.url === 'string' && body.url.trim() !== ''
        ? pathFromUrl(body.url.trim())
        : '/app/notifications';

  if (!athleteId || !title || !message) {
    return notifyJson({ error: 'athlete_id, title, and message are required' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: athlete, error: athErr } = await supabase.from('athletes').select('id').eq('id', athleteId).maybeSingle();
  if (athErr || !athlete) {
    return notifyJson({ error: 'Athlete not found' }, 404);
  }

  // Target subscriptions linked via OneSignal.login(athlete_id) on the client.
  const payload = buildOneSignalPayload({
    appId,
    externalUserIds: [athleteId],
    title,
    message,
    path,
  });

  const osRes = await fetch(ONESIGNAL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${restApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const osJson = (await osRes.json()) as Record<string, unknown>;
  if (!osRes.ok) {
    console.error('[send-notification] OneSignal error', osRes.status, osJson);
    return notifyJson({ success: false, error: osJson }, 502);
  }

  return notifyJson({ success: true, id: osJson.id ?? null });
});
