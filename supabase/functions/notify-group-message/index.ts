import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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
      console.error('[notify-group-message] missing service role key');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }
    if (!getOneSignalCredentials()) {
      console.error('[notify-group-message] missing OneSignal credentials');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }

    let body: {
      league_id?: string;
      sender_athlete_id?: string;
      sender_name?: string;
      preview?: string;
    };
    try {
      body = await req.json();
    } catch {
      return notifyJson({ error: 'Invalid JSON' }, 400);
    }

    const leagueId = typeof body.league_id === 'string' ? body.league_id.trim() : '';
    const senderAthleteId =
      typeof body.sender_athlete_id === 'string' ? body.sender_athlete_id.trim() : '';
    const senderName = typeof body.sender_name === 'string' ? body.sender_name.trim() : 'Someone';
    const preview = typeof body.preview === 'string' ? body.preview.trim() : '';

    if (!leagueId || !senderAthleteId) {
      return notifyJson({ error: 'league_id and sender_athlete_id are required' }, 400);
    }

    if (auth.kind === 'user' && auth.athleteId !== senderAthleteId) {
      return notifyJson({ success: false, error: 'Forbidden' }, 403);
    }

    const { data: leagueRow, error: leagueErr } = await supabase
      .from('private_leagues')
      .select('name, conversation_id')
      .eq('id', leagueId)
      .maybeSingle();

    if (leagueErr) {
      console.error('[notify-group-message] league lookup', leagueErr);
      return notifyJson({ success: false, error: leagueErr.message }, 500);
    }

    const leagueName = sanitizePushText((leagueRow?.name as string | undefined) || 'League', 80);
    const conversationId = String((leagueRow as { conversation_id?: string | null })?.conversation_id ?? '').trim();
    const chatPath = conversationId ? `/app/chat/group/${conversationId}` : `/app/leagues/${leagueId}`;

    const { data: members, error: memErr } = await supabase
      .from('private_league_members')
      .select('athlete_id')
      .eq('league_id', leagueId)
      .eq('status', 'accepted');

    if (memErr) {
      console.error('[notify-group-message] members query', memErr);
      return notifyJson({ success: false, error: memErr.message }, 500);
    }

    const recipientAthleteIds = (members || [])
      .map((m: { athlete_id: string }) => m.athlete_id)
      .filter((id: string) => id && id !== senderAthleteId);

    if (recipientAthleteIds.length === 0) {
      return notifyJson({ success: true, skipped: true, reason: 'no recipients' });
    }

    const externalUserIds = [...new Set(recipientAthleteIds.map((id: string) => String(id)))];
    const safeSender = sanitizePushText(senderName, 60);
    const safePreview = sanitizePushText(preview || 'Message', 180);

    const osResult = await sendOneSignalPush({
      appId: '',
      externalUserIds,
      title: `${leagueName} 💬`,
      message: `${safeSender}: ${safePreview}`,
      path: chatPath,
    });

    const { httpStatus, payload } = outcomeFromOneSignal('notify-group-message', osResult, {
      leagueId,
      recipientCount: externalUserIds.length,
    });
    return notifyJson(payload, httpStatus);
  } catch (e) {
    console.error('[notify-group-message]', e);
    return notifyJson({ success: false, error: 'Internal error' }, 500);
  }
});
