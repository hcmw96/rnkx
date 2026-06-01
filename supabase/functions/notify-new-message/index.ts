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
      const errors = (osJson as { errors?: unknown }).errors ?? null;
      console.log('[notify-new-message] onesignal result', {
        requestId,
        receiverAthleteId: trimmedReceiver,
        externalUserId,
        status: osRes.status,
        ok: osRes.ok,
        oneSignalId: (osJson as { id?: unknown }).id ?? null,
        errors,
      });
      if (!osRes.ok) {
        console.error('[notify-new-message] OneSignal', osRes.status, osJson);
      } else if (errors) {
        console.warn('[notify-new-message] OneSignal delivered with errors (device may be unsubscribed)', {
          externalUserId,
          errors,
        });
      }
    }

    async function resolveGroupRecipientIds(
      convId: string,
      senderId: string,
    ): Promise<string[]> {
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

      if (ids.length > 0) {
        return ids;
      }

      const { data: leagueRow } = await supabase
        .from('private_leagues')
        .select('id')
        .eq('conversation_id', convId)
        .maybeSingle();

      const leagueId = (leagueRow as { id?: string } | null)?.id;
      if (!leagueId) {
        return ids;
      }

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
      const recipientIds = await resolveGroupRecipientIds(conversationId, senderAthleteId);
      console.log('[notify-new-message] group recipients', {
        requestId,
        recipientCount: recipientIds.length,
        recipientIds,
      });

      if (recipientIds.length === 0) {
        console.warn('[notify-new-message] no group recipients — push skipped', {
          requestId,
          conversationId,
          senderAthleteId,
        });
        return json({ success: true });
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
      const preview = sanitize(messageBody, 200);

      for (const rid of recipientIds) {
        await notifyAthlete(rid, senderDisplay, preview, `/app/chat/group/${conversationId}`);
      }

      return json({ success: true });
    }

    const receiverAthleteId =
      typeof body.receiver_athlete_id === 'string' ? body.receiver_athlete_id.trim() : '';
    const senderAthleteIdForDm =
      typeof body.sender_athlete_id === 'string' ? body.sender_athlete_id.trim() : '';
    let senderName = typeof body.sender_name === 'string' ? body.sender_name.trim() : '';
    const preview = typeof body.preview === 'string' ? body.preview.trim() : '';

    if (!receiverAthleteId) {
      console.warn('[notify-new-message] missing receiver_athlete_id and not a group payload');
      return json({ success: true });
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

    const dmPath = senderAthleteIdForDm
      ? `/app/chat/${senderAthleteIdForDm}`
      : '/app/chat';

    console.log('[notify-new-message] direct payload', {
      requestId,
      receiverAthleteId,
      senderAthleteId: senderAthleteIdForDm,
      previewLen: preview.length,
      path: dmPath,
    });
    await notifyAthlete(receiverAthleteId, senderName || 'Someone', preview || 'New message', dmPath);
  } catch (e) {
    console.error('[notify-new-message]', e);
  }

  return json({ success: true });
});
