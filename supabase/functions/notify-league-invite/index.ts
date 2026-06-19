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

  const auth = await authenticateNotifyRequest(req);
  if (!auth) {
    return notifyJson({ error: 'Unauthorized' }, 401);
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    console.error('[notify-league-invite] missing service role key');
    return notifyJson({ error: 'Server misconfiguration' }, 500);
  }
  if (!getOneSignalCredentials()) {
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

  const externalUserId = await resolveAthleteExternalId(supabase, invitedUserId);
  if (!externalUserId) {
    return notifyJson({ success: false, error: 'Athlete not found' }, 404);
  }

  const safeInviter = sanitizePushText(inviterName, 80);
  const safeLeague = sanitizePushText(leagueName, 80);

  const osResult = await sendOneSignalPush({
    appId: '',
    externalUserIds: [externalUserId],
    title: 'League Invitation',
    message: `${safeInviter} invited you to join ${safeLeague}`,
    path: '/app/notifications',
  });

  const { httpStatus, payload } = outcomeFromOneSignal('notify-league-invite', osResult, {
    externalUserId,
  });
  return notifyJson(payload, httpStatus);
});
