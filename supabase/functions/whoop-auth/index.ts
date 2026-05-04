import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_PROFILE_URL = 'https://api.prod.whoop.com/developer/v2/user/profile/basic';
const WHOOP_WORKOUT_COLLECTION = 'https://api.prod.whoop.com/developer/v2/activity/workout';

type WhoopWorkoutRecord = { score?: { max_heart_rate?: number } };
type WhoopWorkoutListJson = {
  records?: WhoopWorkoutRecord[];
  next_token?: string;
  nextToken?: string;
};

async function syncHistoricMaxHrFromWhoop(
  supabase: SupabaseClient,
  athleteId: string,
  accessToken: string,
): Promise<void> {
  const startIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  let peak = 0;
  let nextCursor: string | undefined;

  for (let page = 0; page < 40; page++) {
    const params = new URLSearchParams({ limit: '25', start: startIso });
    if (nextCursor) params.set('nextToken', nextCursor);

    const res = await fetch(`${WHOOP_WORKOUT_COLLECTION}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.warn('whoop-auth: workout collection fetch failed', res.status);
      return;
    }

    const json = (await res.json()) as WhoopWorkoutListJson;
    for (const r of json.records ?? []) {
      const m = r.score?.max_heart_rate;
      if (typeof m === 'number' && Number.isFinite(m) && m > peak) peak = m;
    }

    nextCursor =
      typeof json.next_token === 'string' && json.next_token.trim() !== ''
        ? json.next_token.trim()
        : typeof json.nextToken === 'string' && json.nextToken.trim() !== ''
          ? json.nextToken.trim()
          : undefined;
    if (!nextCursor) break;
  }

  if (peak <= 0) return;

  const { data: row, error: readErr } = await supabase
    .from('athletes')
    .select('max_hr')
    .eq('id', athleteId)
    .maybeSingle();
  if (readErr) {
    console.error('whoop-auth: read max_hr', readErr);
    return;
  }

  const raw = row?.max_hr as number | string | null | undefined;
  const currentNum = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  const currentOk = Number.isFinite(currentNum) && currentNum > 0;
  if (currentOk && peak <= currentNum) return;

  const rounded = Math.round(peak);
  const { error: upErr } = await supabase
    .from('athletes')
    .update({ max_hr: rounded, max_hr_source: 'whoop_historic' })
    .eq('id', athleteId);
  if (upErr) console.error('whoop-auth: max_hr update', upErr);
}

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

  let body: { code?: string; athlete_id?: string };
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

  const authHeader = req.headers.get('Authorization');
  const bearer = authHeader?.replace(/^Bearer\s+/i, '')?.trim() ?? '';

  let athlete: { id: string; wearables: unknown } | null = null;

  let jwtUser: { id: string } | null = null;
  if (bearer) {
    const {
      data: { user },
      error: jwtError,
    } = await supabase.auth.getUser(bearer);
    if (!jwtError && user) jwtUser = user;
  }

  if (jwtUser) {
    const byUser = await supabase.from('athletes').select('id, wearables').eq('user_id', jwtUser.id).maybeSingle();
    const byId = await supabase.from('athletes').select('id, wearables').eq('id', jwtUser.id).maybeSingle();
    athlete = (byUser.data ?? byId.data) as { id: string; wearables: unknown } | null;
    if (!athlete) {
      return new Response(JSON.stringify({ error: 'Athlete not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } else {
    const athleteIdParam = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
    if (!athleteIdParam) {
      return new Response(JSON.stringify({ error: 'athlete_id required when not authenticated' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: row, error: rowErr } = await supabase
      .from('athletes')
      .select('id, wearables')
      .eq('id', athleteIdParam)
      .maybeSingle();
    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: 'Athlete not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    athlete = row as { id: string; wearables: unknown };
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

  try {
    await syncHistoricMaxHrFromWhoop(supabase, athlete.id, accessToken);
  } catch (e) {
    console.warn('whoop-auth: historic max HR fetch skipped', e);
  }

  return new Response(JSON.stringify({ ok: true, wearables }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
