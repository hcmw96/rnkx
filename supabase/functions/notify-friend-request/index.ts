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

function formatLeagueType(t: string): string {
  const s = t.trim();
  if (!s) return 'workout';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: notifyCorsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return notifyJson({ success: true });
    }

    const auth = await authenticateNotifyRequest(req);
    if (!auth) {
      return notifyJson({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appId = getOneSignalAppId();
    const apiKey = getOneSignalApiKey();

    if (!supabaseUrl || !serviceKey || !appId || !apiKey) {
      console.error('[notify-friend-request] missing env');
      return notifyJson({ success: true });
    }

    let body: { from_athlete_id?: string; to_athlete_id?: string };
    try {
      body = await req.json();
    } catch {
      return notifyJson({ success: true });
    }

    const fromId = typeof body.from_athlete_id === 'string' ? body.from_athlete_id.trim() : '';
    const toId = typeof body.to_athlete_id === 'string' ? body.to_athlete_id.trim() : '';

    if (!fromId || !toId) {
      console.warn('[notify-friend-request] missing from_athlete_id or to_athlete_id');
      return notifyJson({ success: true });
    }

    if (auth.kind === 'user' && auth.athleteId !== fromId) {
      console.warn('[notify-friend-request] sender mismatch', { caller: auth.athleteId, fromId });
      return notifyJson({ success: false, error: 'Forbidden' }, 403);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const [fromRes, toRes] = await Promise.all([
      supabase.from('athletes').select('id, username').eq('id', fromId).maybeSingle(),
      supabase.from('athletes').select('id').eq('id', toId).maybeSingle(),
    ]);

    if (fromRes.error) console.error('[notify-friend-request] from athlete', fromRes.error);
    if (toRes.error) console.error('[notify-friend-request] to athlete', toRes.error);

    if (!toRes.data?.id) {
      console.warn('[notify-friend-request] unknown recipient athlete', toId);
      return notifyJson({ success: true });
    }
    const externalUserId = String(toRes.data.id);

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
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(
        buildOneSignalPayload({
          appId,
          externalUserIds: [externalUserId],
          title,
          message,
          path: '/app/notifications',
        }),
      ),
    });

    const osJson = await osRes.json().catch(() => ({}));
    if (!osRes.ok) {
      console.error('[notify-friend-request] OneSignal', osRes.status, osJson);
    }
  } catch (e) {
    console.error('[notify-friend-request]', e);
  }

  return notifyJson({ success: true });
});
