import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';
const DEFAULT_LEAGUES_URL = 'https://rnkx.netlify.app/app/social';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sanitize(s: string, max: number): string {
  const t = s.replace(/[\r\n\u0000]/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const apiKey = Deno.env.get('ONESIGNAL_API_KEY')?.trim();

  if (!supabaseUrl || !serviceKey) {
    console.error('[notify-league-invite] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!appId || !apiKey) {
    console.error('[notify-league-invite] missing ONESIGNAL_APP_ID or ONESIGNAL_API_KEY');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: {
    invited_user_id?: string;
    league_name?: string;
    league_id?: string;
    inviter_name?: string;
  }; // league_id accepted for API compatibility with client
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const invitedUserId = typeof body.invited_user_id === 'string' ? body.invited_user_id.trim() : '';
  const leagueName = typeof body.league_name === 'string' ? body.league_name.trim() : '';
  const inviterName = typeof body.inviter_name === 'string' ? body.inviter_name.trim() : 'Someone';

  if (!invitedUserId || !leagueName) {
    return new Response(JSON.stringify({ error: 'invited_user_id and league_name are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let athlete: { id: string; user_id: string | null } | null = null;
  let athErr: { message: string } | null = null;

  const byUser = await supabase
    .from('athletes')
    .select('id, user_id')
    .eq('user_id', invitedUserId)
    .maybeSingle();
  if (byUser.error) {
    athErr = byUser.error;
  } else if (byUser.data?.id) {
    athlete = byUser.data;
  } else {
    const byId = await supabase
      .from('athletes')
      .select('id, user_id')
      .eq('id', invitedUserId)
      .maybeSingle();
    if (byId.error) athErr = byId.error;
    else athlete = byId.data?.id ? byId.data : null;
  }

  if (athErr) {
    console.error('[notify-league-invite] athlete lookup', athErr);
    return new Response(JSON.stringify({ success: false, error: athErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!athlete?.id) {
    return new Response(JSON.stringify({ success: false, error: 'Athlete not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // OneSignal.login() uses athletes.id as external_user_id — target that, not auth user UUID.
  const externalUserId = String(athlete.id);

  const safeInviter = sanitize(inviterName, 80);
  const safeLeague = sanitize(leagueName, 80);
  const contents = `${safeInviter} invited you to join ${safeLeague}`;

  const osPayload = {
    app_id: appId,
    filters: [{ field: 'external_user_id', value: externalUserId }],
    headings: { en: 'League Invitation' },
    contents: { en: contents },
    url: DEFAULT_LEAGUES_URL,
  };

  const osRes = await fetch(ONESIGNAL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify(osPayload),
  });

  const osJson = (await osRes.json()) as Record<string, unknown>;
  if (!osRes.ok) {
    console.error('[notify-league-invite] OneSignal error', osRes.status, osJson);
    return new Response(JSON.stringify({ success: false, error: osJson }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
