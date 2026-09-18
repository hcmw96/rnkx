import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  isBeforeJoin,
  isOutsideSeason,
  observedSessionHr,
  parseStoredMaxHr,
} from '../_shared/hrScoring.ts';
import { scheduleLoopsFirstWorkout } from '../_shared/scheduleLoopsFirstWorkout.ts';

function isScoredProcessResult(data: unknown): boolean {
  if (data == null) return false;
  const payload = typeof data === 'string'
    ? (() => {
      try {
        return JSON.parse(data) as unknown;
      } catch {
        return null;
      }
    })()
    : data;
  if (typeof payload !== 'object' || payload === null) return false;
  return String((payload as { status?: unknown }).status).toLowerCase() === 'scored';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const body = (await req.json()) as {
    appleWorkouts?: unknown;
    source?: string;
    athlete_id?: string;
  };

  if (body.source !== 'apple') {
    return new Response(JSON.stringify({ error: 'Expected source: "apple"' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!Array.isArray(body.appleWorkouts)) {
    return new Response(JSON.stringify({ error: 'Expected appleWorkouts array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  console.log('first workout avg_hr:', JSON.stringify((body.appleWorkouts as any[])?.[0]?.avgHr));
  
  if (!body.athlete_id) {
    return new Response(JSON.stringify({ error: 'Missing athlete_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const workouts: unknown[] = body.appleWorkouts;
  const { data: athlete } = await supabase
    .from('athletes')
    .select('created_at, max_hr, max_hr_source')
    .eq('id', body.athlete_id)
    .maybeSingle();
  const joinedAt = athlete?.created_at ? String(athlete.created_at) : null;

  const { data: season } = await supabase
    .from('seasons')
    .select('id, starts_at, ends_at')
    .eq('is_active', true)
    .maybeSingle();

  let batchPeak = 0;
  for (const workout of workouts) {
    const w = workout as Record<string, unknown>;
    const avg = typeof w.avgHr === 'number' ? w.avgHr : null;
    const peak = typeof w.peakHr === 'number' ? w.peakHr : null;
    const observed = observedSessionHr(avg, peak);
    if (observed != null && observed > batchPeak) batchPeak = observed;
  }
  const storedMax = parseStoredMaxHr(athlete?.max_hr as number | string | null | undefined);
  if (batchPeak > 0 && (storedMax == null || batchPeak > storedMax) && athlete?.max_hr_source !== 'manual') {
    await supabase
      .from('athletes')
      .update({ max_hr: Math.round(batchPeak), max_hr_source: 'apple_watch' })
      .eq('id', body.athlete_id);
  }

  const results = [];
  for (const workout of workouts) {
    const w = workout as Record<string, unknown>;
    const startedAt = typeof w.startedAt === 'string' ? w.startedAt : '';
    const startMs = startedAt ? Date.parse(startedAt) : NaN;
    if (isBeforeJoin(startMs, joinedAt)) {
      results.push({ sourceId: w.sourceId, result: { status: 'skipped', reject_reason: 'before_join' }, error: null });
      continue;
    }
    if (!season || isOutsideSeason(startMs, season.starts_at as string | null, season.ends_at as string | null)) {
      results.push({ sourceId: w.sourceId, result: { status: 'skipped', reject_reason: 'outside_season' }, error: null });
      continue;
    }
    const payload = {
      athlete_id: body.athlete_id,
      source_id: w.sourceId,
      started_at: w.startedAt,
      duration_min: w.durationMin,
      activity_type: w.activityType,
      avg_hr: w.avgHr ?? null,
      peak_hr: w.peakHr ?? null,
      distance_m: w.distanceM ?? null,
      avg_pace_per_km: w.avgPacePerKm ?? null,
      raw_payload: w,
    };

    const { data, error } = await supabase.rpc('process_activity', { payload });
    results.push({ sourceId: w.sourceId, result: data, error: error?.message });
    if (!error && isScoredProcessResult(data)) {
      scheduleLoopsFirstWorkout(body.athlete_id, 'sync-activities');
    }
  }

  console.log('sync-activities results:', JSON.stringify(results));

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
