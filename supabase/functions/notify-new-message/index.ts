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
      console.error('[notify-new-message] missing service role key');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }
    if (!getOneSignalCredentials()) {
      console.error('[notify-new-message] missing OneSignal credentials');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return notifyJson({ error: 'Invalid JSON' }, 400);
    }

    const senderFromBody =
      typeof body.sender_athlete_id === 'string' ? body.sender_athlete_id.trim() : '';
    if (auth.kind === 'user' && senderFromBody && auth.athleteId !== senderFromBody) {
      return notifyJson({ success: false, error: 'Forbidden' }, 403);
    }

    const requestId = crypto.randomUUID().slice(0, 8);
    console.log('[notify-new-message] start', { requestId });

    async function notifyAthlete(
      receiverAthleteId: string,
      senderDisplay: string,
      previewRaw: string,
      path: string,
    ): Promise<{ httpStatus: number; payload: Record<string, unknown> }> {
      const externalUserId = await resolveAthleteExternalId(supabase, receiverAthleteId);
      if (!externalUserId) {
        console.warn('[notify-new-message] unknown receiver athlete', receiverAthleteId);
        return { httpStatus: 404, payload: { success: false, error: 'Receiver athlete not found' } };
      }

      const title = `${sanitizePushText(senderDisplay, 60)} 💬`;
      const message = sanitizePushText(previewRaw || 'New message', 200);

      const osResult = await sendOneSignalPush({
        appId: '',
        externalUserIds: [externalUserId],
        title,
        message,
        path,
      });

      return outcomeFromOneSignal('notify-new-message', osResult, {
        requestId,
        receiverAthleteId,
        externalUserId,
      });
    }

    async function resolveGroupRecipientIds(convId: string, senderId: string): Promise<string[]> {
      const { data: cmRows, error: cmErr } = await supabase
        .from('conversation_members')
        .select('athlete_id')
        .eq('conversation_id', convId);

      if (cmErr) {
        console.error('[notify-new-message] conversation_members', cmErr);
      }

      let ids = [...new Set((cmRows ?? []).map((r) => String((r as { athlete_id?: string }).athlete_id ?? '')))].filter(
        (id) => id.length > 0 && id !== senderId,
      );

      if (ids.length > 0) return ids;

      const { data: leagueRow } = await supabase
        .from('private_leagues')
        .select('id')
        .eq('conversation_id', convId)
        .maybeSingle();

      const leagueId = (leagueRow as { id?: string } | null)?.id;
      if (!leagueId) return ids;

      const { data: plmRows, error: plmErr } = await supabase
        .from('private_league_members')
        .select('athlete_id')
        .eq('league_id', leagueId)
        .eq('status', 'accepted');

      if (plmErr) {
        console.error('[notify-new-message] private_league_members fallback', plmErr);
        return ids;
      }

      ids = [...new Set((plmRows ?? []).map((r) => String((r as { athlete_id?: string }).athlete_id ?? '')))].filter(
        (id) => id.length > 0 && id !== senderId,
      );

      if (ids.length > 0) {
        console.log('[notify-new-message] recipients from club members fallback', {
          conversationId: convId,
          leagueId,
          recipientIds: ids,
        });
        const toInsert = ids.map((athlete_id) => ({ conversation_id: convId, athlete_id }));
        await supabase.from('conversation_members').upsert(toInsert, {
          onConflict: 'conversation_id,athlete_id',
          ignoreDuplicates: true,
        });
      }

      return ids;
    }

    const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : '';
    const senderAthleteId = typeof body.sender_athlete_id === 'string' ? body.sender_athlete_id.trim() : '';
    const messageBody = typeof body.message_body === 'string' ? body.message_body.trim() : '';

    if (conversationId && senderAthleteId && messageBody) {
      const recipientIds = await resolveGroupRecipientIds(conversationId, senderAthleteId);
      if (recipientIds.length === 0) {
        return notifyJson({ success: true, skipped: true, reason: 'no group recipients' });
      }

      const { data: senderRow } = await supabase
        .from('athletes')
        .select('username, display_name')
        .eq('id', senderAthleteId)
        .maybeSingle();

      const sr = senderRow as { username?: string | null; display_name?: string | null } | null;
      const u = sr?.username != null ? String(sr.username).trim() : '';
      const d = sr?.display_name != null ? String(sr.display_name).trim() : '';
      const senderDisplay = u || d || 'Someone';
      const preview = sanitizePushText(messageBody, 200);

      const outcomes: Record<string, unknown>[] = [];
      for (const rid of recipientIds) {
        const { httpStatus, payload } = await notifyAthlete(
          rid,
          senderDisplay,
          preview,
          `/app/chat/group/${conversationId}`,
        );
        outcomes.push({ recipientId: rid, httpStatus, ...payload });
        if (httpStatus === 502) {
          return notifyJson({ success: false, error: payload.error, outcomes }, 502);
        }
      }

      const anyPartial = outcomes.some((o) => o.partial === true);
      return notifyJson({
        success: true,
        partial: anyPartial || undefined,
        recipients: recipientIds.length,
        outcomes,
      });
    }

    const receiverAthleteId =
      typeof body.receiver_athlete_id === 'string' ? body.receiver_athlete_id.trim() : '';
    const senderAthleteIdForDm =
      typeof body.sender_athlete_id === 'string' ? body.sender_athlete_id.trim() : '';
    let senderName = typeof body.sender_name === 'string' ? body.sender_name.trim() : '';
    const preview = typeof body.preview === 'string' ? body.preview.trim() : '';

    if (!receiverAthleteId) {
      return notifyJson({ error: 'receiver_athlete_id is required for direct messages' }, 400);
    }

    if (!senderName && senderAthleteIdForDm) {
      const { data: senderRow } = await supabase
        .from('athletes')
        .select('username, display_name')
        .eq('id', senderAthleteIdForDm)
        .maybeSingle();
      const sr = senderRow as { username?: string | null; display_name?: string | null } | null;
      const u = sr?.username != null ? String(sr.username).trim() : '';
      const d = sr?.display_name != null ? String(sr.display_name).trim() : '';
      senderName = u || d || 'Someone';
    }

    const dmPath = senderAthleteIdForDm ? `/app/chat/${senderAthleteIdForDm}` : '/app/chat';
    const { httpStatus, payload } = await notifyAthlete(
      receiverAthleteId,
      senderName || 'Someone',
      preview || 'New message',
      dmPath,
    );
    return notifyJson(payload, httpStatus);
  } catch (e) {
    console.error('[notify-new-message]', e);
    return notifyJson({ success: false, error: 'Internal error' }, 500);
  }
});
