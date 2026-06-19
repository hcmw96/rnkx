import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { resolveAthleteExternalId } from '../_shared/athleteLookup.ts';
import { authenticateNotifyRequest, createServiceRoleClient, notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';
import {
  getOneSignalCredentials,
  outcomeFromOneSignal,
  sanitizePushText,
  sendOneSignalPush,
} from '../_shared/onesignalSend.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: notifyCorsHeaders });
  }
  if (req.method !== 'POST') {
    return notifyJson({ error: 'Method not allowed' }, 405);
  }

  try {
    const auth = await authenticateNotifyRequest(req);
    if (!auth) {
      return notifyJson({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      console.error('[notify-friend-request] missing service role key');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }
    if (!getOneSignalCredentials()) {
      console.error('[notify-friend-request] missing OneSignal credentials');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }

    let body: { from_athlete_id?: string; to_athlete_id?: string };
    try {
      body = await req.json();
    } catch {
      return notifyJson({ error: 'Invalid JSON' }, 400);
    }

    const fromId = typeof body.from_athlete_id === 'string' ? body.from_athlete_id.trim() : '';
    const toId = typeof body.to_athlete_id === 'string' ? body.to_athlete_id.trim() : '';

    if (!fromId || !toId) {
      return notifyJson({ error: 'from_athlete_id and to_athlete_id are required' }, 400);
    }

    if (auth.kind === 'user' && auth.athleteId !== fromId) {
      return notifyJson({ success: false, error: 'Forbidden' }, 403);
    }

    const externalUserId = await resolveAthleteExternalId(supabase, toId);
    if (!externalUserId) {
      return notifyJson({ success: false, error: 'Recipient athlete not found' }, 404);
    }

    const { data: fromRow } = await supabase
      .from('athletes')
      .select('username, display_name')
      .or(`id.eq.${fromId},user_id.eq.${fromId}`)
      .limit(1)
      .maybeSingle();

    const fr = fromRow as { username?: string | null; display_name?: string | null } | null;
    const fromUsername = sanitizePushText(
      (fr?.username && String(fr.username).trim()) ||
        (fr?.display_name && String(fr.display_name).trim()) ||
        'Someone',
      80,
    );

    const osResult = await sendOneSignalPush({
      appId: '',
      externalUserIds: [externalUserId],
      title: 'New friend request 👋',
      message: `${fromUsername} wants to be your friend on RNKX`,
      path: '/app/notifications',
    });

    const { httpStatus, payload } = outcomeFromOneSignal('notify-friend-request', osResult, {
      fromId,
      externalUserId,
    });
    return notifyJson(payload, httpStatus);
  } catch (e) {
    console.error('[notify-friend-request]', e);
    return notifyJson({ success: false, error: 'Internal error' }, 500);
  }
});
