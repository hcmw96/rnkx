import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Auth
  const authHeader = req.headers.get('Authorization');
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader?.replace('Bearer ', '') ?? ''
  );
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  const body = (await req.json()) as {
    appleWorkouts?: unknown;
    source?: string;
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

  const workouts: unknown[] = body.appleWorkouts;

  const results = [];
  for (const workout of workouts) {
    const w = workout as Record<string, unknown>;
    const payload = {
      athlete_id: user.id,
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
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
