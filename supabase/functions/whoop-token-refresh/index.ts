import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const DEFAULT_CLIENT_ID = '35885b30-f053-4b61-813b-e63702f1c83a';
const REFRESH_WINDOW_MS = 2 * 60 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type WhoopConnectionRow = {
  id: string;
  athlete_id: string;
  refresh_token: string | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function refreshWhoopTokens(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<
  | { ok: true; access_token: string; refresh_token?: string; expires_in: number }
  | { ok: false; reason: string }
> {
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'offline',
  });

  let res: Response;
  try {
    res = await fetch(WHOOP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `network error: ${message}` };
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail =
      typeof body.error_description === 'string'
        ? body.error_description
        : typeof body.error === 'string'
          ? body.error
          : `HTTP ${res.status}`;
    return { ok: false, reason: detail };
  }

  const access_token = typeof body.access_token === 'string' ? body.access_token : '';
  const refresh_token = typeof body.refresh_token === 'string' ? body.refresh_token : undefined;
  const expires_in = typeof body.expires_in === 'number' ? body.expires_in : 3600;

  if (!access_token) {
    return { ok: false, reason: 'missing access_token in refresh response' };
  }

  return { ok: true, access_token, refresh_token, expires_in };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('[whoop-token-refresh] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfiguration' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const clientId = Deno.env.get('WHOOP_CLIENT_ID')?.trim() || DEFAULT_CLIENT_ID;
  const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET')?.trim();
  if (!clientSecret) {
    console.error('[whoop-token-refresh] WHOOP_CLIENT_SECRET not set');
    return json({ error: 'Server misconfiguration' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const expiresBefore = new Date(Date.now() + REFRESH_WINDOW_MS).toISOString();

  const { data: rows, error: listErr } = await supabase
    .from('whoop_connections')
    .select('id, athlete_id, refresh_token')
    .lt('token_expires_at', expiresBefore);

  if (listErr) {
    console.error('[whoop-token-refresh] list connections', listErr);
    return json({ error: listErr.message }, 500);
  }

  const connections = (rows ?? []) as WhoopConnectionRow[];
  let refreshed = 0;
  let failed = 0;

  for (const conn of connections) {
    const athleteId = conn.athlete_id;
    const refreshToken = conn.refresh_token?.trim() ?? '';

    if (!refreshToken) {
      failed += 1;
      console.error('[whoop-token-refresh] failed', {
        athlete_id: athleteId,
        reason: 'missing refresh_token',
      });
      continue;
    }

    const result = await refreshWhoopTokens(clientId, clientSecret, refreshToken);
    if (!result.ok) {
      failed += 1;
      console.error('[whoop-token-refresh] failed', {
        athlete_id: athleteId,
        reason: result.reason,
      });
      continue;
    }

    const tokenExpiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();
    const updatePayload: Record<string, string> = {
      access_token: result.access_token,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    };
    if (result.refresh_token) {
      updatePayload.refresh_token = result.refresh_token;
    }

    const { error: updateErr } = await supabase
      .from('whoop_connections')
      .update(updatePayload)
      .eq('id', conn.id);

    if (updateErr) {
      failed += 1;
      console.error('[whoop-token-refresh] failed', {
        athlete_id: athleteId,
        reason: `database update: ${updateErr.message}`,
      });
      continue;
    }

    refreshed += 1;
    console.log('[whoop-token-refresh] refreshed', { athlete_id: athleteId });
  }

  const summary = {
    checked: connections.length,
    refreshed,
    failed,
    expires_before: expiresBefore,
  };

  console.log('[whoop-token-refresh] summary', summary);
  return json(summary);
});
