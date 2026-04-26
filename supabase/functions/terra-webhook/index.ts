import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function bufferToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function verifyTerraSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  maxSkewSec = 300,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const parts = signatureHeader.split(',').map((p) => p.trim());
  let t = '';
  let v1 = '';
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (k === 't') t = v;
    if (k === 'v1') v1 = v;
  }
  if (!t || !v1) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > maxSkewSec) return false;

  const signedPayload = `${t}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = bufferToHex(sig);
  return timingSafeEqualHex(expected.toLowerCase(), v1.toLowerCase());
}

function mapTerraActivityToProcessPayload(
  activity: Record<string, unknown>,
  athleteId: string,
): Record<string, unknown> | null {
  const meta = activity.metadata as Record<string, unknown> | undefined;
  if (!meta) return null;
  const summaryId = meta.summary_id;
  const startTime = meta.start_time;
  if (typeof summaryId !== 'string' || typeof startTime !== 'string') return null;

  const endTime = typeof meta.end_time === 'string' ? meta.end_time : undefined;
  let durationMin = 0;
  if (endTime) {
    durationMin = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000;
  }
  const activeDur = activity.active_durations_data as Record<string, unknown> | undefined;
  const activitySec = activeDur?.activity_seconds ?? activeDur?.in_activity_seconds;
  if (typeof activitySec === 'number' && activitySec > 0) {
    durationMin = activitySec / 60;
  } else if (typeof activitySec === 'string' && Number(activitySec) > 0) {
    durationMin = Number(activitySec) / 60;
  }

  const hrData = activity.heart_rate_data as Record<string, unknown> | undefined;
  const hrSummary = (hrData?.summary as Record<string, unknown>) ?? {};
  const avgHr = hrSummary.avg_heart_rate ?? hrSummary.avg_hr_bpm ?? hrSummary.avg_hr;
  const peakHr = hrSummary.max_heart_rate ?? hrSummary.max_hr_bpm ?? hrSummary.max_hr;

  const distData = activity.distance_data as Record<string, unknown> | undefined;
  const distSummary = (distData?.summary as Record<string, unknown>) ?? {};
  const distanceM =
    distSummary.distance_meters ?? distSummary.distance_metres ?? distSummary.distance_m;

  let paceSecPerKm: number | null = null;
  const distNum = distanceM != null ? Number(distanceM) : NaN;
  if (Number.isFinite(distNum) && distNum > 0 && durationMin > 0) {
    const km = distNum / 1000;
    paceSecPerKm = (durationMin * 60) / km;
  }

  const name = meta.name;
  const activityType = typeof name === 'string' ? name.toLowerCase() : 'unknown';

  return {
    athlete_id: athleteId,
    source_id: `terra_${summaryId}`,
    started_at: startTime,
    duration_min: Math.max(0, durationMin),
    activity_type: activityType,
    avg_hr: avgHr != null && avgHr !== '' ? Number(avgHr) : null,
    peak_hr: peakHr != null && peakHr !== '' ? Number(peakHr) : null,
    distance_m: Number.isFinite(distNum) ? distNum : null,
    avg_pace_per_km: paceSecPerKm != null && Number.isFinite(paceSecPerKm) ? paceSecPerKm : null,
    raw_payload: activity,
  };
}

async function mergeWearableProvider(
  supabase: ReturnType<typeof createClient>,
  athleteId: string,
  provider: string,
) {
  const p = provider.toUpperCase();
  const { data: row } = await supabase.from('athletes').select('wearables').eq('id', athleteId).maybeSingle();
  const prev = (row?.wearables as string[] | null) ?? [];
  if (prev.includes(p)) return;
  await supabase.from('athletes').update({ wearables: [...prev, p] }).eq('id', athleteId);
}

async function rebuildWearablesFromConnections(
  supabase: ReturnType<typeof createClient>,
  athleteId: string,
) {
  const { data: rows } = await supabase.from('terra_connections').select('provider').eq('athlete_id', athleteId);
  const next = [...new Set((rows ?? []).map((r) => String(r.provider).toUpperCase()))];
  await supabase.from('athletes').update({ wearables: next }).eq('id', athleteId);
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signingSecret = Deno.env.get('TERRA_WEBHOOK_SECRET');
  if (!signingSecret) {
    return new Response(JSON.stringify({ error: 'TERRA_WEBHOOK_SECRET not set' }), { status: 500 });
  }

  const rawBody = await req.text();
  const sigHeader =
    req.headers.get('terra-signature') ??
    req.headers.get('Terra-Signature') ??
    req.headers.get('TERRA-SIGNATURE');

  const valid = await verifyTerraSignature(rawBody, sigHeader, signingSecret);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Ping mode: full payload at URL
  if (payload.type === 's3_payload' && typeof payload.url === 'string') {
    const r = await fetch(payload.url);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch S3 payload' }), { status: 502 });
    }
    try {
      payload = await r.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid S3 JSON' }), { status: 502 });
    }
  }

  const type = String(payload.type ?? '');
  const user = payload.user as Record<string, unknown> | undefined;
  const referenceId = user?.reference_id != null ? String(user.reference_id) : '';
  const terraUserId = user?.user_id != null ? String(user.user_id) : '';
  const provider = user?.provider != null ? String(user.provider) : '';

  // Auth lifecycle
  const authOk =
    (type === 'auth' || type === 'user_reauth') && payload.status === 'success' && referenceId && terraUserId && provider;

  if (authOk) {
    const { error: upErr } = await supabase.from('terra_connections').upsert(
      {
        athlete_id: referenceId,
        terra_user_id: terraUserId,
        provider: provider.toUpperCase(),
      },
      { onConflict: 'terra_user_id' },
    );
    if (upErr) {
      console.error('terra_connections upsert', upErr);
      return new Response(JSON.stringify({ error: upErr.message }), { status: 500 });
    }
    await mergeWearableProvider(supabase, referenceId, provider);
    return new Response(JSON.stringify({ ok: true, handled: 'auth' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if ((type === 'deauth' || type === 'access_revoked') && terraUserId) {
    const { data: conn } = await supabase
      .from('terra_connections')
      .select('athlete_id')
      .eq('terra_user_id', terraUserId)
      .maybeSingle();
    await supabase.from('terra_connections').delete().eq('terra_user_id', terraUserId);
    if (conn?.athlete_id) {
      await rebuildWearablesFromConnections(supabase, String(conn.athlete_id));
    }
    return new Response(JSON.stringify({ ok: true, handled: type }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (type !== 'activity') {
    return new Response(JSON.stringify({ ok: true, ignored: type || 'unknown' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!referenceId) {
    return new Response(JSON.stringify({ error: 'Missing user.reference_id' }), { status: 400 });
  }

  const data = payload.data;
  const activities: Record<string, unknown>[] = Array.isArray(data)
    ? (data as Record<string, unknown>[])
    : data && typeof data === 'object'
      ? [data as Record<string, unknown>]
      : [];

  const results: unknown[] = [];
  for (const act of activities) {
    const procPayload = mapTerraActivityToProcessPayload(act, referenceId);
    if (!procPayload) {
      results.push({ skipped: true });
      continue;
    }
    const { data: rpcData, error: rpcErr } = await supabase.rpc('process_activity', {
      payload: procPayload,
    });
    results.push({ source_id: procPayload.source_id, result: rpcData, error: rpcErr?.message });
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
