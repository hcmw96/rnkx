import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { buildOneSignalPayload } from '../_shared/onesignalPush.ts';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

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

function sanitize(s: string, max: number): string {
  const t = s.replace(/[\r\n\u0000]/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return json({ success: true });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
    const apiKey = Deno.env.get('ONESIGNAL_API_KEY')?.trim();

    if (!supabaseUrl || !serviceKey || !appId || !apiKey) {
      console.error('[notify-new-message] missing env');
      return json({ success: true });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ success: true });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const requestId = crypto.randomUUID().slice(0, 8);
    console.log('[notify-new-message] start', { requestId });

    async function notifyAthlete(
      receiverAthleteId: string,
      senderDisplay: string,
      previewRaw: string,
      path: string,
    ): Promise<void> {
      const trimmedReceiver = receiverAthleteId.trim();
      if (!trimmedReceiver) return;

      const { data: athlete, error: athErr } = await supabase
        .from('athletes')
        .select('id')
        .eq('id', trimmedReceiver)
        .maybeSingle();

      if (athErr) {
        console.error('[notify-new-message] athlete lookup', athErr);
        return;
      }

      if (!athlete?.id) {
        console.warn('[notify-new-message] unknown receiver athlete', trimmedReceiver);
        return;
      }
      const externalUserId = String(athlete.id);

      const title = `${sanitize(senderDisplay, 60)} 💬`;
      const message = sanitize(previewRaw || 'New message', 200);

      const payload = buildOneSignalPayload({
        appId,
        externalUserIds: [externalUserId],
        title,
        message,
        path,
      });

      const osRes = await fetch(ONESIGNAL_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const osJson = await osRes.json().catch(() => ({}));
      console.log('[notify-new-message] onesignal result', {
        requestId,
        receiverAthleteId: trimmedReceiver,
        externalUserId,
        status: osRes.status,
        ok: osRes.ok,
        oneSignalId: (osJson as { id?: unknown }).id ?? null,
        errors: (osJson as { errors?: unknown }).errors ?? null,
      });
      if (!osRes.ok) {
        console.error('[notify-new-message] OneSignal', osRes.status, osJson);
      }
    }

    /** League / group chat: fan out to all conversation members except the sender */
    const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : '';
    const senderAthleteId = typeof body.sender_athlete_id === 'string' ? body.sender_athlete_id.trim() : '';
    const messageBody = typeof body.message_body === 'string' ? body.message_body.trim() : '';

    if (conversationId && senderAthleteId && messageBody) {
      console.log('[notify-new-message] group payload', {
        requestId,
        conversationId,
        senderAthleteId,
        previewLen: messageBody.length,
      });
      const { data: rows, error: memErr } = await supabase
        .from('conversation_members')
        .select('athlete_id')
        .eq('conversation_id', conversationId);

      if (memErr) {
        console.error('[notify-new-message] conversation_members', memErr);
        return json({ success: true });
      }

      const recipientIds = [...new Set((rows ?? []).map((r) => String((r as { athlete_id?: string }).athlete_id ?? '')))].filter(
        (id) => id.length > 0 && id !== senderAthleteId,
      );
      console.log('[notify-new-message] group recipients', {
        requestId,
        recipientCount: recipientIds.length,
        recipientIds,
      });

      const { data: senderRow } = await supabase
        .from('athletes')
        .select('username, display_name')
        .eq('id', senderAthleteId)
        .maybeSingle();

      const sr = senderRow as { username?: string | null; display_name?: string | null } | null;
      const u = sr?.username != null ? String(sr.username).trim() : '';
      const d = sr?.display_name != null ? String(sr.display_name).trim() : '';
      const senderDisplay = u || d || 'Someone';
      const preview = sanitize(messageBody, 200);

      for (const rid of recipientIds) {
        await notifyAthlete(rid, senderDisplay, preview, `/app/chat/group/${conversationId}`);
      }

      return json({ success: true });
    }

    const senderAthleteId = typeof body.sender_athlete_id === 'string' ? body.sender_athlete_id.trim() : '';
    const receiverAthleteId =
      typeof body.receiver_athlete_id === 'string' ? body.receiver_athlete_id.trim() : '';
    const senderName = typeof body.sender_name === 'string' ? body.sender_name.trim() : 'Someone';
    const preview = typeof body.preview === 'string' ? body.preview.trim() : '';

    if (!receiverAthleteId) {
      console.warn('[notify-new-message] missing receiver_athlete_id and not a group payload');
      return json({ success: true });
    }

    const dmPath = senderAthleteId
      ? `/app/chat/${senderAthleteId}`
      : '/app/chat';

    console.log('[notify-new-message] direct payload', {
      requestId,
      receiverAthleteId,
      senderAthleteId,
      previewLen: preview.length,
      path: dmPath,
    });
    await notifyAthlete(receiverAthleteId, senderName, preview || 'New message', dmPath);
  } catch (e) {
    console.error('[notify-new-message]', e);
  }

  return json({ success: true });
});
