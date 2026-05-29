import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_PLAYERS_API = 'https://onesignal.com/api/v1/players';

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

function onesignalApiKey(): string | null {
  return (
    Deno.env.get('ONESIGNAL_API_KEY')?.trim() ??
    Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim() ??
    null
  );
}

async function setBadgeForExternalUser(
  appId: string,
  apiKey: string,
  externalUserId: string,
  badgeCount: number,
): Promise<number> {
  const listUrl = `${ONESIGNAL_PLAYERS_API}?app_id=${encodeURIComponent(appId)}&external_user_id=${encodeURIComponent(externalUserId)}&limit=50`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  });
  const listJson = (await listRes.json().catch(() => ({}))) as {
    players?: { id?: string }[];
  };

  if (!listRes.ok) {
    console.error('[update-app-badge] list players failed', externalUserId, listRes.status, listJson);
    return 0;
  }

  const players = listJson.players ?? [];
  if (!players.length) {
    console.warn('[update-app-badge] no OneSignal players for', externalUserId);
    return 0;
  }

  let updated = 0;
  for (const player of players) {
    const playerId = typeof player.id === 'string' ? player.id : '';
    if (!playerId) continue;

    const editRes = await fetch(`${ONESIGNAL_PLAYERS_API}/${playerId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        badge_count: badgeCount,
      }),
    });

    if (!editRes.ok) {
      const editJson = await editRes.json().catch(() => ({}));
      console.error('[update-app-badge] edit player failed', playerId, editRes.status, editJson);
      continue;
    }
    updated += 1;
  }

  return updated;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const apiKey = onesignalApiKey();

  if (!supabaseUrl || !anonKey || !serviceKey || !appId || !apiKey) {
    console.error('[update-app-badge] missing env');
    return json({ error: 'Server misconfiguration' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { badge_count?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const badgeCount =
    typeof body.badge_count === 'number' && Number.isFinite(body.badge_count)
      ? Math.max(0, Math.min(99, Math.round(body.badge_count)))
      : null;

  if (badgeCount === null) {
    return json({ error: 'badge_count is required' }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();

  if (userErr || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const [byUserId, byId] = await Promise.all([
    admin.from('athletes').select('id').eq('user_id', user.id).maybeSingle(),
    admin.from('athletes').select('id').eq('id', user.id).maybeSingle(),
  ]);
  const athleteId = String(byUserId.data?.id ?? byId.data?.id ?? '');
  if (!athleteId) {
    return json({ error: 'Athlete not found' }, 404);
  }

  const devicesUpdated = await setBadgeForExternalUser(appId, apiKey, athleteId, badgeCount);
  return json({ success: true, badge_count: badgeCount, devices_updated: devicesUpdated });
});
