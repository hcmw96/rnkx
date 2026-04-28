import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_WORKOUT_COLLECTION = 'https://api.prod.whoop.com/developer/v2/activity/workout';
const DEFAULT_CLIENT_ID = '35885b30-f053-4b61-813b-e63702f1c83a';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type WhoopWorkout = {
  id?: string;
  start?: string;
  end?: string;
  sport_id?: number;
  score?: {
    average_heart_rate?: number;
    max_heart_rate?: number;
  };
};

type WhoopWorkoutCollection = {
  records?: WhoopWorkout[];
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    console.error('[whoop-sync-manual] token refresh failed', res.status, body);
    return null;
  }
  const access_token = typeof body.access_token === 'string' ? body.access_token : '';
  const refresh_token = typeof body.refresh_token === 'string' ? body.refresh_token : undefined;
  const expires_in = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  if (!access_token) return null;
  return { access_token, refresh_token, expires_in };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Server misconfiguration' }, 500);
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as { athlete_id?: string };
    const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
    if (!athleteId) return json({ error: 'athlete_id required' }, 400);

    const { data: conn, error: connErr } = await supabase
      .from('whoop_connections')
      .select('id, athlete_id, access_token, refresh_token, token_expires_at')
      .eq('athlete_id', athleteId)
      .maybeSingle();
    if (connErr || !conn) {
      return json({ inserted: 0, skipped: 0 });
    }

    const clientId = Deno.env.get('WHOOP_CLIENT_ID')?.trim() || DEFAULT_CLIENT_ID;
    const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET')?.trim();
    if (!clientSecret) return json({ error: 'Server misconfiguration' }, 500);

    let accessToken = conn.access_token as string;
    let refreshToken = conn.refresh_token as string | null;
    const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at as string) : new Date(0);

    if (expiresAt <= new Date()) {
      if (!refreshToken) return json({ inserted: 0, skipped: 0 });
      const refreshed = await refreshWhoopTokens(clientId, clientSecret, refreshToken);
      if (!refreshed) return json({ inserted: 0, skipped: 0 });
      accessToken = refreshed.access_token;
      if (refreshed.refresh_token) refreshToken = refreshed.refresh_token;
      await supabase
        .from('whoop_connections')
        .update({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conn.id);
    }

    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const listUrl = `${WHOOP_WORKOUT_COLLECTION}?limit=25&start=${encodeURIComponent(start)}`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      let detail: unknown;
      try {
        detail = await listRes.json();
      } catch {
        detail = await listRes.text();
      }
      console.error('[whoop-sync-manual] workout fetch failed', listRes.status, detail);
      return json({ inserted: 0, skipped: 0 });
    }

    const list = (await listRes.json()) as WhoopWorkoutCollection;
    const workouts = list.records ?? [];

    const { data: athlete } = await supabase
      .from('athletes')
      .select('id, max_hr')
      .eq('id', athleteId)
      .maybeSingle();
    if (!athlete) return json({ inserted: 0, skipped: workouts.length });

    const rawMaxHr = athlete.max_hr as number | string | null | undefined;
    const parsedMax =
      typeof rawMaxHr === 'number' ? rawMaxHr : typeof rawMaxHr === 'string' ? Number(rawMaxHr) : NaN;
    const currentMaxHr = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 190;

    const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).maybeSingle();

    let inserted = 0;
    let skipped = 0;
    let highestSeen = currentMaxHr;

    for (const workout of workouts) {
      const wid = workout.id != null ? String(workout.id) : '';
      const startIso = typeof workout.start === 'string' ? workout.start : '';
      const endIso = typeof workout.end === 'string' ? workout.end : '';
      if (!wid || !startIso || !endIso) {
        skipped++;
        continue;
      }

      const { data: dup } = await supabase
        .from('activities')
        .select('id')
        .eq('source', 'whoop')
        .eq('source_id', wid)
        .maybeSingle();
      if (dup) {
        skipped++;
        continue;
      }

      const startMs = new Date(startIso).getTime();
      const endMs = new Date(endIso).getTime();
      const durationMinutes = Math.min(120, Math.max(0, Math.round((endMs - startMs) / 60_000)));
      const avgHr = typeof workout.score?.average_heart_rate === 'number' ? workout.score.average_heart_rate : null;
      const avgHrPercent = avgHr != null ? Math.round((avgHr / currentMaxHr) * 100) : null;
      const sportId = typeof workout.sport_id === 'number' ? workout.sport_id : -1;
      const { league_type, activity_type } = mapSportId(sportId);

      const { error } = await supabase.from('activities').insert({
        athlete_id: athleteId,
        season_id: season?.id ?? null,
        league_type,
        activity_type,
        duration_minutes: durationMinutes,
        avg_pace_seconds: null,
        avg_hr_percent: avgHrPercent,
        activity_date: startIso.split('T')[0] ?? startIso.slice(0, 10),
        source: 'whoop',
        source_id: wid,
      });

      if (error) {
        if (error.code === '23505') skipped++;
        else {
          console.error('[whoop-sync-manual] insert error', error);
          skipped++;
        }
        continue;
      }
      inserted++;

      const workoutMaxHr = typeof workout.score?.max_heart_rate === 'number' ? workout.score.max_heart_rate : null;
      if (workoutMaxHr != null && workoutMaxHr > highestSeen) highestSeen = workoutMaxHr;
    }

    if (highestSeen > currentMaxHr) {
      await supabase
        .from('athletes')
        .update({ max_hr: Math.round(highestSeen), max_hr_source: 'whoop_live' })
        .eq('id', athleteId);
    }

    return json({ inserted, skipped });
  } catch (err) {
    console.error('[whoop-sync-manual] unhandled', err);
    return json({ inserted: 0, skipped: 0 });
  }
});

