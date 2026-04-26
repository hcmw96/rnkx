import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Match terra-widget-session credentials until moved to secrets. */
const TERRA_API_KEY = 'RH_SYC48243Za9tDO5XnsFt9I0j3Jg1x';
const TERRA_DEV_ID = 'rnkx-prod-HQg8bWyjdQ';

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

  let body: { terra_user_id?: string; provider?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const terraUserId = typeof body.terra_user_id === 'string' ? body.terra_user_id.trim() : '';
  if (!terraUserId) {
    return new Response(JSON.stringify({ error: 'terra_user_id required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: conn, error: connErr } = await supabase
    .from('terra_connections')
    .select('id, athlete_id, provider, terra_user_id')
    .eq('terra_user_id', terraUserId)
    .maybeSingle();

  if (connErr || !conn) {
    return new Response(JSON.stringify({ error: 'Connection not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: athlete, error: athErr } = await supabase
    .from('athletes')
    .select('id, user_id')
    .eq('id', conn.athlete_id)
    .maybeSingle();

  if (athErr || !athlete) {
    return new Response(JSON.stringify({ error: 'Athlete not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const owns = athlete.id === user.id || (athlete.user_id != null && athlete.user_id === user.id);
  if (!owns) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (typeof body.provider === 'string' && body.provider.trim()) {
    if (body.provider.trim().toUpperCase() !== String(conn.provider).toUpperCase()) {
      return new Response(JSON.stringify({ error: 'provider mismatch' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const terraUrl = `https://api.tryterra.co/v2/user/${encodeURIComponent(terraUserId)}`;
  const terraRes = await fetch(terraUrl, {
    method: 'DELETE',
    headers: {
      'x-api-key': TERRA_API_KEY,
      'dev-id': TERRA_DEV_ID,
    },
  });

  if (!terraRes.ok && terraRes.status !== 404) {
    let detail: unknown;
    try {
      detail = await terraRes.json();
    } catch {
      detail = await terraRes.text();
    }
    console.error('Terra DELETE user failed', terraRes.status, detail);
    return new Response(JSON.stringify({ error: 'Terra API error', status: terraRes.status, detail }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { error: delErr } = await supabase.from('terra_connections').delete().eq('terra_user_id', terraUserId);
  if (delErr) {
    console.error('terra_connections delete', delErr);
    return new Response(JSON.stringify({ error: delErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: remaining } = await supabase
    .from('terra_connections')
    .select('provider')
    .eq('athlete_id', conn.athlete_id);

  const wearables = [...new Set((remaining ?? []).map((r) => String(r.provider).toUpperCase()))];

  const { error: upErr } = await supabase.from('athletes').update({ wearables }).eq('id', conn.athlete_id);
  if (upErr) {
    console.error('athletes wearables update', upErr);
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, wearables }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
