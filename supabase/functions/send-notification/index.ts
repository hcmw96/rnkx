import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { resolveAthleteExternalId } from '../_shared/athleteLookup.ts';
import { pathFromUrl } from '../_shared/onesignalPush.ts';
import { authenticateNotifyRequest, createServiceRoleClient, notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';
import {
  getOneSignalCredentials,
  outcomeFromOneSignal,
  sendOneSignalPush,
} from '../_shared/onesignalSend.ts';

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

  const supabase = createServiceRoleClient();
  if (!supabase) {
    console.error('[send-notification] missing service role key');
    return notifyJson({ error: 'Server misconfiguration' }, 500);
  }
  if (!getOneSignalCredentials()) {
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
  const title = typeof body.title === 'string' ? body.title.replace(/[\r\n\u0000]/g, ' ').trim().slice(0, 120) : '';
  const message =
    typeof body.message === 'string' ? body.message.replace(/[\r\n\u0000]/g, ' ').trim().slice(0, 500) : '';
  const path =
    typeof body.path === 'string' && body.path.trim() !== ''
      ? body.path.trim()
      : typeof body.url === 'string' && body.url.trim() !== ''
        ? pathFromUrl(body.url.trim())
        : '/app/notifications';

  if (!athleteId || !title || !message) {
    return notifyJson({ error: 'athlete_id, title, and message are required' }, 400);
  }

  const externalUserId = await resolveAthleteExternalId(supabase, athleteId);
  if (!externalUserId) {
    return notifyJson({ error: 'Athlete not found' }, 404);
  }

  const osResult = await sendOneSignalPush({
    appId: '',
    externalUserIds: [externalUserId],
    title,
    message,
    path,
  });

  const { httpStatus, payload } = outcomeFromOneSignal('send-notification', osResult, { externalUserId });
  return notifyJson(payload, httpStatus);
});
