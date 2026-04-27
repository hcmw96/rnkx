import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function rcAuthHeader(publicKey: string): string {
  const token = btoa(`${publicKey}:`);
  return `Basic ${token}`;
}

function isPremiumEntitlementActive(ent: Record<string, unknown> | null | undefined): boolean {
  if (!ent || typeof ent !== 'object') return false;
  const expires = ent['expires_date'];
  if (expires === null || expires === undefined) return true;
  if (typeof expires !== 'string') return false;
  const t = Date.parse(expires);
  if (Number.isNaN(t)) return false;
  return t > Date.now();
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rcPublicKey = Deno.env.get('REVENUECAT_PUBLIC_KEY')?.trim();
  if (!rcPublicKey) {
    console.error('[check-entitlement] REVENUECAT_PUBLIC_KEY not set');
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const authHeader = req.headers.get('Authorization');
  const jwt = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(jwt);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized', isPremium: false }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const email = typeof user.email === 'string' && user.email.trim() !== '' ? user.email.trim() : null;
  if (!email) {
    return new Response(JSON.stringify({ isPremium: false, error: 'No email on account' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: athleteRows, error: athErr } = await supabase
    .from('athletes')
    .select('id')
    .or(`user_id.eq.${user.id},id.eq.${user.id}`)
    .not('username', 'is', null)
    .limit(1);

  const athlete = athleteRows?.[0] as { id: string } | undefined;

  if (athErr || !athlete?.id) {
    return new Response(JSON.stringify({ isPremium: false, error: 'Athlete not found' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const athleteId = athlete.id as string;

  const subUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(email)}`;
  const rcRes = await fetch(subUrl, {
    headers: { Authorization: rcAuthHeader(rcPublicKey) },
  });

  let isPremium = false;
  if (rcRes.ok) {
    const body = (await rcRes.json()) as Record<string, unknown>;
    const subscriber = body['subscriber'] as Record<string, unknown> | undefined;
    const entitlements = subscriber?.['entitlements'] as Record<string, unknown> | undefined;
    const premium = entitlements?.['premium'] as Record<string, unknown> | undefined;
    isPremium = isPremiumEntitlementActive(premium);
  } else if (rcRes.status !== 404) {
    let detail: unknown;
    try {
      detail = await rcRes.json();
    } catch {
      detail = await rcRes.text();
    }
    console.error('[check-entitlement] RevenueCat error', rcRes.status, detail);
  }

  const { error: upErr } = await supabase.from('athletes').update({ is_premium: isPremium }).eq('id', athleteId);
  if (upErr) {
    console.error('[check-entitlement] athletes update', upErr);
    return new Response(JSON.stringify({ error: upErr.message, isPremium }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ isPremium }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
