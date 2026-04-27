import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const DEFAULT_CLIENT_ID = '35885b30-f053-4b61-813b-e63702f1c83a';

type WhoopWebhookPayload = {
  user_id?: string | number;
  event_type?: string;
  data?: { id?: string | number };
};

type WhoopWorkout = {
  id?: string;
  start?: string;
  end?: string;
  sport_id?: number;
  score?: {
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
  };
};

function mapSportId(sportId: number): { league_type: 'run' | 'engine'; activity_type: string } {
  if (sportId === 0) return { league_type: 'run', activity_type: 'outdoor_run' };
  if (sportId === 71) return { league_type: 'run', activity_type: 'outdoor_run' };
  if (sportId === 1) return { league_type: 'engine', activity_type: 'engine' };
  return { league_type: 'engine', activity_type: 'engine' };
}

async function refreshWhoopTokens(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in: number } | null> {
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'offline',
  });
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error('[whoop-webhook] token refresh failed', res.status, json);
    return null;
  }
  const access_token = typeof json.access_token === 'string' ? json.access_token : '';
  const expires_in = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  const refresh_token = typeof json.refresh_token === 'string' ? json.refresh_token : undefined;
  if (!access_token) return null;
  return { access_token, refresh_token, expires_in };
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const payload = (await req.json()) as WhoopWebhookPayload;
    const eventType = typeof payload.event_type === 'string' ? payload.event_type : '';
    if (!eventType.toLowerCase().includes('workout')) {
      return new Response(JSON.stringify({ status: 'ignored', event_type: eventType }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const whoopUserId =
      payload.user_id != null && String(payload.user_id).trim() !== '' ? String(payload.user_id).trim() : '';
    const workoutId =
      payload.data?.id != null && String(payload.data.id).trim() !== '' ? String(payload.data.id).trim() : '';
    if (!whoopUserId || !workoutId) {
      return new Response(JSON.stringify({ status: 'ignored', reason: 'missing user_id or workout id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      console.error('[whoop-webhook] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: conn, error: connErr } = await supabase
      .from('whoop_connections')
      .select('id, athlete_id, access_token, refresh_token, token_expires_at')
      .eq('whoop_user_id', whoopUserId)
      .maybeSingle();

    if (connErr) {
      console.error('[whoop-webhook] whoop_connections lookup', connErr);
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (!conn) {
      return new Response(JSON.stringify({ status: 'ignored', reason: 'unknown user' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientId = Deno.env.get('WHOOP_CLIENT_ID')?.trim() || DEFAULT_CLIENT_ID;
    const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET')?.trim();
    if (!clientSecret) {
      console.error('[whoop-webhook] WHOOP_CLIENT_SECRET not set');
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500 });
    }

    let accessToken = conn.access_token as string;
    let refreshToken = conn.refresh_token as string | null;
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at as string) : new Date(0);
    const now = new Date();

    if (expiresAt <= now) {
      if (!refreshToken) {
        console.warn('[whoop-webhook] token expired and no refresh_token', conn.athlete_id);
        return new Response(JSON.stringify({ status: 'ignored', reason: 'token expired' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const refreshed = await refreshWhoopTokens(clientId, clientSecret, refreshToken);
      if (!refreshed) {
        return new Response(JSON.stringify({ status: 'ignored', reason: 'refresh failed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      accessToken = refreshed.access_token;
      if (refreshed.refresh_token) refreshToken = refreshed.refresh_token;
      const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      const { error: upTokErr } = await supabase
        .from('whoop_connections')
        .update({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: newExpires,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id);
      if (upTokErr) {
        console.error('[whoop-webhook] failed to persist refreshed tokens', upTokErr);
        return new Response(JSON.stringify({ status: 'ignored' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const workoutUrl = `https://api.prod.whoop.com/developer/v2/activity/workout/${encodeURIComponent(workoutId)}`;
    const wRes = await fetch(workoutUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!wRes.ok) {
      let detail: unknown;
      try {
        detail = await wRes.json();
      } catch {
        detail = await wRes.text();
      }
      console.error('[whoop-webhook] workout fetch failed', wRes.status, detail);
      return new Response(JSON.stringify({ status: 'ignored', reason: 'workout fetch failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const workout = (await wRes.json()) as WhoopWorkout;
    const wid = workout.id != null ? String(workout.id) : workoutId;
    const startIso = typeof workout.start === 'string' ? workout.start : '';
    const endIso = typeof workout.end === 'string' ? workout.end : '';
    if (!startIso || !endIso) {
      return new Response(JSON.stringify({ status: 'ignored', reason: 'missing start/end' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: athlete, error: athErr } = await supabase
      .from('athletes')
      .select('id, max_hr')
      .eq('id', conn.athlete_id)
      .maybeSingle();

    if (athErr || !athlete) {
      console.error('[whoop-webhook] athlete not found', athErr);
      return new Response(JSON.stringify({ status: 'ignored' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const rawMaxHr = athlete.max_hr as number | string | null | undefined;
    const parsedMax =
      typeof rawMaxHr === 'number' ? rawMaxHr : typeof rawMaxHr === 'string' ? Number(rawMaxHr) : NaN;
    const maxHr = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 190;
    const avgHr = typeof workout.score?.average_heart_rate === 'number' ? workout.score.average_heart_rate : null;
    const avgHrPercent = avgHr != null ? Math.round((avgHr / maxHr) * 100) : null;

    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    const durationMinutes = Math.min(120, Math.max(0, Math.round((endMs - startMs) / 60_000)));

    const sportId = typeof workout.sport_id === 'number' ? workout.sport_id : -1;
    const { league_type, activity_type } = mapSportId(sportId);

    const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).maybeSingle();

    const { data: dup } = await supabase
      .from('activities')
      .select('id')
      .eq('source', 'whoop')
      .eq('source_id', wid.toString())
      .maybeSingle();

    if (dup) {
      return new Response(JSON.stringify({ status: 'duplicate' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const activityDate = startIso.split('T')[0] ?? startIso.slice(0, 10);

    const { error: insErr } = await supabase.from('activities').insert({
      athlete_id: conn.athlete_id,
      season_id: season?.id ?? null,
      league_type,
      activity_type,
      duration_minutes: durationMinutes,
      avg_pace_seconds: null,
      avg_hr_percent: avgHrPercent,
      activity_date: activityDate,
      source: 'whoop',
      source_id: wid.toString(),
    });

    if (insErr) {
      if (insErr.code === '23505') {
        return new Response(JSON.stringify({ status: 'duplicate' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      console.error('[whoop-webhook] insert error', insErr);
      return new Response(JSON.stringify({ status: 'error', message: insErr.message }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ status: 'inserted', workout_id: wid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[whoop-webhook] unhandled', err);
    return new Response(JSON.stringify({ status: 'error', error: String(err) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
