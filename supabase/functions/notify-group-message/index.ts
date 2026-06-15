import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getOneSignalApiKey, getOneSignalAppId } from '../_shared/onesignalEnv.ts';
import { buildOneSignalPayload } from '../_shared/onesignalPush.ts';
import { notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

function sanitize(s: string, max: number): string {
  const t = s.replace(/[\r\n\u0000]/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: notifyCorsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return notifyJson({ success: true });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appId = getOneSignalAppId();
    const apiKey = getOneSignalApiKey();

    if (!supabaseUrl || !serviceKey || !appId || !apiKey) {
      console.error('[notify-group-message] missing env');
      return notifyJson({ success: true });
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
      return notifyJson({ success: true });
    }

    const leagueId = typeof body.league_id === 'string' ? body.league_id.trim() : '';
    const senderAthleteId =
      typeof body.sender_athlete_id === 'string' ? body.sender_athlete_id.trim() : '';
    const senderName = typeof body.sender_name === 'string' ? body.sender_name.trim() : 'Someone';
    const preview = typeof body.preview === 'string' ? body.preview.trim() : '';

    if (!leagueId || !senderAthleteId) {
      console.warn('[notify-group-message] missing league_id or sender_athlete_id');
      return notifyJson({ success: true });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: leagueRow, error: leagueErr } = await supabase
      .from('private_leagues')
      .select('name, conversation_id')
      .eq('id', leagueId)
      .maybeSingle();

    if (leagueErr) {
      console.error('[notify-group-message] league lookup', leagueErr);
      return notifyJson({ success: true });
    }

    const leagueName = sanitize((leagueRow?.name as string | undefined) || 'League', 80);
    const conversationId = String((leagueRow as { conversation_id?: string | null })?.conversation_id ?? '').trim();
    const chatPath = conversationId ? `/app/chat/group/${conversationId}` : `/app/leagues/${leagueId}`;

    const { data: members, error: memErr } = await supabase
      .from('private_league_members')
      .select('athlete_id')
      .eq('league_id', leagueId)
      .eq('status', 'accepted');

    if (memErr) {
      console.error('[notify-group-message] members query', memErr);
      return notifyJson({ success: true });
    }

    const recipientAthleteIds = (members || [])
      .map((m: { athlete_id: string }) => m.athlete_id)
      .filter((id: string) => id && id !== senderAthleteId);

    if (recipientAthleteIds.length === 0) {
      return notifyJson({ success: true });
    }

    const externalUserIds = [...new Set(recipientAthleteIds.map((id: string) => String(id)))];

    const safeSender = sanitize(senderName, 60);
    const safePreview = sanitize(preview || 'Message', 180);
    const title = `${leagueName} 💬`;
    const message = `${safeSender}: ${safePreview}`;

    const osRes = await fetch(ONESIGNAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(
        buildOneSignalPayload({
          appId,
          externalUserIds,
          title,
          message,
          path: chatPath,
        }),
      ),
    });

    const osJson = await osRes.json().catch(() => ({}));
    if (!osRes.ok) {
      console.error('[notify-group-message] OneSignal', osRes.status, osJson);
    }
  } catch (e) {
    console.error('[notify-group-message]', e);
  }

  return notifyJson({ success: true });
});
