import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_PROFILE_URL = 'https://api.prod.whoop.com/developer/v2/user/profile/basic';

const DEFAULT_CLIENT_ID = '35885b30-f053-4b61-813b-e63702f1c83a';
const DEFAULT_REDIRECT_URI = 'https://rnkx.netlify.app/auth/whoop/callback';

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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!code) {
    return new Response(JSON.stringify({ error: 'code required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const clientId = Deno.env.get('WHOOP_CLIENT_ID')?.trim() || DEFAULT_CLIENT_ID;
  const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET')?.trim();
  if (!clientSecret) {
    console.error('whoop-auth: WHOOP_CLIENT_SECRET not set');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const redirectUri = Deno.env.get('WHOOP_REDIRECT_URI')?.trim() || DEFAULT_REDIRECT_URI;

  const byUser = await supabase.from('athletes').select('id, wearables').eq('user_id', user.id).maybeSingle();
  const byId = await supabase.from('athletes').select('id, wearables').eq('id', user.id).maybeSingle();
  const athlete = byUser.data ?? byId.data;
  if (!athlete) {
    return new Response(JSON.stringify({ error: 'Athlete not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const tokenRes = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const tokenJson = (await tokenRes.json()) as Record<string, unknown>;
  if (!tokenRes.ok) {
    console.error('whoop-auth: token exchange failed', tokenRes.status, tokenJson);
    return new Response(
      JSON.stringify({
        error: 'WHOOP token exchange failed',
        detail: tokenJson,
      }),
      {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }

  const accessToken = typeof tokenJson.access_token === 'string' ? tokenJson.access_token : '';
  const refreshToken = typeof tokenJson.refresh_token === 'string' ? tokenJson.refresh_token : null;
  const expiresIn = typeof tokenJson.expires_in === 'number' ? tokenJson.expires_in : 3600;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Invalid token response' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  let whoopUserId: string | null = null;
  try {
    const profRes = await fetch(WHOOP_PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profRes.ok) {
      const prof = (await profRes.json()) as { user_id?: number };
      if (typeof prof.user_id === 'number') whoopUserId = String(prof.user_id);
    }
  } catch (e) {
    console.warn('whoop-auth: profile fetch skipped', e);
  }

  const { error: upsertErr } = await supabase.from('whoop_connections').upsert(
    {
      athlete_id: athlete.id,
      whoop_user_id: whoopUserId,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'athlete_id' },
  );

  if (upsertErr) {
    console.error('whoop_connections upsert', upsertErr);
    return new Response(JSON.stringify({ error: upsertErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const prevWearables = (athlete.wearables ?? []) as string[];
  const wearables = [...new Set([...prevWearables.map((w) => String(w).toUpperCase()), 'WHOOP'])];

  const { error: upAthErr } = await supabase.from('athletes').update({ wearables }).eq('id', athlete.id);
  if (upAthErr) {
    console.error('athletes wearables update', upAthErr);
    return new Response(JSON.stringify({ error: upAthErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, wearables }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
