import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const apiKey = (Deno.env.get('ONESIGNAL_API_KEY') ?? Deno.env.get('ONESIGNAL_REST_API_KEY'))?.trim();

  if (!appId || !apiKey) {
    return new Response(JSON.stringify({ error: 'Missing OneSignal env' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { athlete_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
  if (!athleteId) {
    return new Response(JSON.stringify({ error: 'athlete_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(athleteId)}`;
  const osRes = await fetch(url, {
    headers: { Authorization: `Key ${apiKey}` },
  });

  const osJson = await osRes.json().catch(() => ({}));

  if (osRes.status === 404) {
    return new Response(
      JSON.stringify({
        athlete_id: athleteId,
        linked: false,
        external_id: null,
        subscriptions: [],
        message: 'No OneSignal user for this external_id — setonesignalplayerid may not have run yet.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!osRes.ok) {
    return new Response(JSON.stringify({ error: 'OneSignal lookup failed', status: osRes.status, detail: osJson }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const identity = (osJson as { identity?: { external_id?: string; onesignal_id?: string } }).identity ?? {};
  const subs = (osJson as { subscriptions?: Array<Record<string, unknown>> }).subscriptions ?? [];

  const pushSubs = subs
    .filter((s) => String(s.type ?? '').toLowerCase().includes('push') || s.token)
    .map((s) => ({
      id: s.id ?? null,
      type: s.type ?? null,
      enabled: s.enabled ?? null,
      notification_types: s.notification_types ?? null,
      device_model: s.device_model ?? null,
      device_os: s.device_os ?? null,
      app_version: s.app_version ?? null,
    }));

  return new Response(
    JSON.stringify({
      athlete_id: athleteId,
      linked: Boolean(identity.external_id),
      external_id: identity.external_id ?? null,
      onesignal_id: identity.onesignal_id ?? null,
      subscription_count: pushSubs.length,
      subscribed: pushSubs.some((s) => s.enabled === true),
      subscriptions: pushSubs,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
