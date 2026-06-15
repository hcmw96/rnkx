import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateNotifyRequest, notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';
import { getOneSignalApiKey, getOneSignalAppId } from '../_shared/onesignalEnv.ts';
import { buildOneSignalPayload } from '../_shared/onesignalPush.ts';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

function sanitize(s: string, max: number): string {
  const t = s.replace(/[\r\n\u0000]/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

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
  const apiKey = getOneSignalApiKey();

  if (!supabaseUrl || !serviceKey) {
    console.error('[notify-league-invite] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return notifyJson({ error: 'Server misconfiguration' }, 500);
  }
  if (!appId || !apiKey) {
    console.error('[notify-league-invite] missing OneSignal credentials');
    return notifyJson({ error: 'Server misconfiguration' }, 500);
  }

  let body: {
    invited_user_id?: string;
    league_name?: string;
    league_id?: string;
    inviter_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return notifyJson({ error: 'Invalid JSON' }, 400);
  }

  const invitedUserId = typeof body.invited_user_id === 'string' ? body.invited_user_id.trim() : '';
  const leagueName = typeof body.league_name === 'string' ? body.league_name.trim() : '';
  const inviterName = typeof body.inviter_name === 'string' ? body.inviter_name.trim() : 'Someone';

  if (!invitedUserId || !leagueName) {
    return notifyJson({ error: 'invited_user_id and league_name are required' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: athleteRows, error: athErr } = await supabase
    .from('athletes')
    .select('id')
    .or(`id.eq.${invitedUserId},user_id.eq.${invitedUserId}`)
    .limit(1);

  if (athErr) {
    console.error('[notify-league-invite] athlete lookup', athErr);
    return notifyJson({ success: false, error: athErr.message }, 500);
  }
  const athlete = (athleteRows ?? [])[0] as { id?: string } | undefined;
  if (!athlete?.id) {
    return notifyJson({ success: false, error: 'Athlete not found' }, 404);
  }

  const externalUserId = String(athlete.id);

  const safeInviter = sanitize(inviterName, 80);
  const safeLeague = sanitize(leagueName, 80);
  const contents = `${safeInviter} invited you to join ${safeLeague}`;

  const osPayload = buildOneSignalPayload({
    appId,
    externalUserIds: [externalUserId],
    title: 'League Invitation',
    message: contents,
    path: '/app/notifications',
  });

  const osRes = await fetch(ONESIGNAL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(osPayload),
  });

  const osJson = (await osRes.json()) as Record<string, unknown>;
  if (!osRes.ok) {
    console.error('[notify-league-invite] OneSignal error', osRes.status, osJson);
    return notifyJson({ success: false, error: osJson }, 502);
  }

  return notifyJson({ success: true });
});
