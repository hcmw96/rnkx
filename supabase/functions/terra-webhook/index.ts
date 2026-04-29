import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AthleteRow = {
  id: string;
  selected_leagues: string[] | null;
  date_of_birth: string | null;
  observed_max_hr: number | null;
  max_hr: number | string | null;
};

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function extractTerraWorkouts(payload: unknown): unknown[] {
  const p = payload as Record<string, unknown> | null;
  if (!p) return [];

  const data = p.data as Record<string, unknown> | unknown[] | undefined;
  if (Array.isArray(data)) return data;
  if (Array.isArray((data as Record<string, unknown> | undefined)?.workouts)) {
    return (data as Record<string, unknown>).workouts as unknown[];
  }
  if (Array.isArray((p as Record<string, unknown>).workouts)) {
    return (p as Record<string, unknown>).workouts as unknown[];
  }
  return [];
}

async function processTerraWorkouts(params: {
  supabase: ReturnType<typeof createClient>;
  athlete: AthleteRow;
  seasonId: string | null;
  provider: string;
  workouts: unknown[];
}) {
  const { supabase, athlete, seasonId, provider, workouts } = params;
  let inserted = 0;
  let skipped = 0;
  let sessionPeakMaxHr = 0;
  const providerUpper = String(provider || "").toUpperCase();

  for (const raw of workouts) {
    const workout = raw as Record<string, any>;
    const rawDuration = workout.active_durations_data?.duration_in_seconds;
    const durationSeconds = (rawDuration && rawDuration > 0)
      ? rawDuration
      : (workout.metadata?.end_time && workout.metadata?.start_time
        ? (new Date(workout.metadata.end_time).getTime() - new Date(workout.metadata.start_time).getTime()) / 1000
        : 0);
    const durationMin = Math.round((Number(durationSeconds) || 0) / 60);
    console.log('[terra-webhook] Duration check:', JSON.stringify({
      name: workout.metadata?.name,
      type: workout.metadata?.type,
      rawDuration,
      durationSeconds,
      durationMin,
      leagues: athlete.selected_leagues,
    }));
    if (durationMin < 15) { skipped++; continue; }

    const startTimeRaw = workout.metadata?.start_time as string | undefined;
    if (!startTimeRaw || typeof startTimeRaw !== 'string') {
      skipped++;
      continue;
    }
    const startMs = Date.parse(startTimeRaw);
    if (!Number.isFinite(startMs)) {
      skipped++;
      continue;
    }
    const workoutStartTime = new Date(startMs).toISOString();
    const activityDate = startTimeRaw.split('T')[0] ?? workoutStartTime.slice(0, 10);

    const summary = workout.heart_rate_data?.summary as
      | { avg_hr_bpm?: number; max_hr_bpm?: number; max_heart_rate?: number }
      | undefined;
    const maxHrFromDevice = summary?.max_hr_bpm ?? summary?.max_heart_rate;
    if (typeof maxHrFromDevice === 'number' && Number.isFinite(maxHrFromDevice) && maxHrFromDevice > sessionPeakMaxHr) {
      sessionPeakMaxHr = maxHrFromDevice;
    }
    const avgHrBpm = summary?.avg_hr_bpm ?? null;
    const maxHrAge = athlete.date_of_birth
      ? 220 - Math.floor((Date.now() - new Date(athlete.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : 190;
    const effectiveMaxHr = Math.max(maxHrAge, athlete.observed_max_hr ?? 0);
    const avgHrPercent = avgHrBpm ? Math.round((avgHrBpm / effectiveMaxHr) * 100) : null;

    const avgSpeedMps = workout.movement_data?.avg_speed_meters_per_second ?? null;
    const avgPaceSeconds = avgSpeedMps && avgSpeedMps > 0 ? Math.round(1000 / avgSpeedMps) : null;

    const rawActivityType = workout.metadata?.type;
    const numericActivityType = Number(rawActivityType);
    const activityType =
      Number.isFinite(numericActivityType)
        ? numericActivityType === 8 || numericActivityType === 58
          ? 'running'
          : numericActivityType === 80
            ? 'strength_training'
            : numericActivityType === 1
              ? 'cycling'
              : numericActivityType === 7
                ? 'walking'
                : 'other'
        : String(rawActivityType ?? '').toLowerCase();
    const isRun = ['running', 'jogging', 'trail_running', 'outdoor_running', 'indoor_running'].includes(activityType);
    const leagues = athlete.selected_leagues ?? [];

    let leagueType: string | null = null;
    if (providerUpper === 'WHOOP') {
      // WHOOP via Terra always scores into engine.
      leagueType = 'engine';
    } else if (isRun && leagues.includes('run') && avgPaceSeconds) {
      leagueType = 'run';
    } else if (!isRun && leagues.includes('engine') && avgHrPercent && avgHrPercent >= 45) {
      leagueType = 'engine';
    } else if (isRun && leagues.includes('engine') && avgHrPercent && avgHrPercent >= 45) {
      leagueType = 'engine';
    }

    console.log('[terra-webhook] Workout:', JSON.stringify({
      name: workout.metadata?.name,
      type: workout.metadata?.type,
      activityType,
      durationMin,
      avgHrBpm,
      avgHrPercent,
      isRun,
      leagueType,
      leagues: athlete.selected_leagues
    }));
    if (!leagueType) { skipped++; continue; }

    const sourceId = `terra_${provider}_${workout.metadata?.workout_id ?? activityDate + '_' + durationMin}`;

    const { data: upserted, error } = await supabase
      .from('activities')
      .upsert(
        {
          athlete_id: athlete.id,
          season_id: seasonId,
          league_type: leagueType,
          activity_type: isRun ? 'outdoor_run' : 'engine',
          duration_minutes: Math.min(durationMin, 120),
          avg_pace_seconds: avgPaceSeconds,
          avg_hr_percent: avgHrPercent,
          activity_date: activityDate,
          source: provider,
          source_id: sourceId,
          workout_start_time: workoutStartTime,
        },
        { onConflict: 'athlete_id,workout_start_time', ignoreDuplicates: true },
      )
      .select('id');

    if (error) {
      console.error('[terra-webhook] Upsert error:', error);
    } else if (upserted && upserted.length > 0) {
      inserted++;
    } else {
      skipped++;
    }
  }

  try {
    if (sessionPeakMaxHr > 0) {
      const rawMx = athlete.max_hr as number | string | null | undefined;
      const curMx =
        typeof rawMx === 'number' ? rawMx : typeof rawMx === 'string' ? Number(rawMx) : NaN;
      const curOk = Number.isFinite(curMx) && curMx > 0;
      if (!curOk || sessionPeakMaxHr > curMx) {
        const { error: mxErr } = await supabase
          .from('athletes')
          .update({ max_hr: Math.round(sessionPeakMaxHr), max_hr_source: 'terra_live' })
          .eq('id', athlete.id);
        if (mxErr) console.error('[terra-webhook] max_hr update', mxErr);
      }
    }
  } catch (e) {
    console.warn('[terra-webhook] max_hr update skipped', e);
  }

  return { inserted, skipped };
}

async function fetchAndProcessLast30Days(params: {
  supabase: ReturnType<typeof createClient>;
  athlete: AthleteRow;
  provider: string;
  terraUserId: string;
  seasonId: string | null;
}) {
  const { supabase, athlete, provider, terraUserId, seasonId } = params;
  const terraApiKey = Deno.env.get('TERRA_API_KEY')?.trim();
  const terraDevId = Deno.env.get('TERRA_DEV_ID')?.trim();
  if (!terraApiKey || !terraDevId) {
    throw new Error('Missing TERRA_API_KEY or TERRA_DEV_ID');
  }

  const end = new Date();
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    user_id: terraUserId,
    start_date: toDateString(start),
    end_date: toDateString(end),
    to_webhook: 'false',
  });
  const res = await fetch(`https://api.tryterra.co/v2/activity?${query.toString()}`, {
    headers: {
      'x-api-key': terraApiKey,
      'dev-id': terraDevId,
    },
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    throw new Error(`Terra activity fetch failed (${res.status}): ${JSON.stringify(detail)}`);
  }
  const payload = await res.json();
  const workouts = extractTerraWorkouts(payload);
  return processTerraWorkouts({ supabase, athlete, seasonId, provider, workouts });
}

serve(async (req) => {
  try {
    const body = await req.json();
    console.log('[terra-webhook] Received:', JSON.stringify(body).substring(0, 500));

    const { type, user, data } = body as Record<string, any>;
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500 });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: season } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .maybeSingle();

    if ((body as { new_user?: unknown; old_user?: unknown }).new_user && (body as { new_user?: unknown; old_user?: unknown }).old_user) {
      const newUser = (body as { new_user: { user_id?: string; reference_id?: string; provider?: string } }).new_user;
      const oldUser = (body as { old_user: { user_id?: string } }).old_user;
      const terraUserId = newUser.user_id;
      const referenceId = newUser.reference_id;
      const provider = newUser.provider;

      if (!terraUserId || !referenceId) {
        return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
      }

      await supabase.from('terra_connections').delete().eq('terra_user_id', oldUser.user_id ?? '');
      const { error } = await supabase
        .from('terra_connections')
        .upsert(
          {
            athlete_id: referenceId,
            terra_user_id: terraUserId,
            provider: provider ?? 'unknown',
            connected_at: new Date().toISOString(),
          },
          { onConflict: 'terra_user_id' },
        );
      if (error) {
        console.error('[terra-webhook] reauth upsert error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }

      const { data: athlete } = await supabase
        .from('athletes')
        .select('id, selected_leagues, date_of_birth, observed_max_hr, max_hr')
        .eq('id', referenceId)
        .single();
      if (!athlete) {
        return new Response(JSON.stringify({ error: 'Athlete not found' }), { status: 404 });
      }
      const backfill = await fetchAndProcessLast30Days({
        supabase,
        athlete: athlete as AthleteRow,
        provider: provider ?? 'unknown',
        terraUserId,
        seasonId: season?.id ?? null,
      });

      console.log('[terra-webhook] User reauthed:', terraUserId, provider, referenceId);
      return new Response(JSON.stringify({ status: 'reauthed', ...backfill }), { status: 200 });
    }

    if (type === 'user_auth' || type === 'auth') {
      const terraUserId = user?.user_id as string | undefined;
      const provider = (user?.provider as string | undefined) ?? (body as { provider?: string }).provider;
      const referenceId = user?.reference_id as string | undefined;
      if (!terraUserId || !referenceId) {
        return new Response(JSON.stringify({ error: 'Missing user_id or reference_id' }), { status: 400 });
      }

      const { error } = await supabase
        .from('terra_connections')
        .upsert(
          {
            athlete_id: referenceId,
            terra_user_id: terraUserId,
            provider: provider ?? 'unknown',
            connected_at: new Date().toISOString(),
          },
          { onConflict: 'terra_user_id' },
        );
      if (error) {
        console.error('[terra-webhook] user_auth upsert error:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }

      const { data: athlete } = await supabase
        .from('athletes')
        .select('id, selected_leagues, date_of_birth, observed_max_hr, max_hr')
        .eq('id', referenceId)
        .single();
      if (!athlete) {
        return new Response(JSON.stringify({ error: 'Athlete not found' }), { status: 404 });
      }
      const backfill = await fetchAndProcessLast30Days({
        supabase,
        athlete: athlete as AthleteRow,
        provider: provider ?? 'unknown',
        terraUserId,
        seasonId: season?.id ?? null,
      });

      console.log('[terra-webhook] User connected:', terraUserId, provider, referenceId);
      return new Response(JSON.stringify({ status: 'connected', ...backfill }), { status: 200 });
    }

    const isUntypedArrayPayload = (type == null || type === '') && Array.isArray(data) && data.length > 0;
    if (!isUntypedArrayPayload && type !== 'activity' && type !== 'workouts') {
      return new Response(JSON.stringify({ status: 'ignored', type }), { status: 200 });
    }

    const terraUserId = user?.user_id as string | undefined;
    if (!terraUserId) {
      return new Response(JSON.stringify({ error: 'No user_id' }), { status: 400 });
    }

    const { data: connection } = await supabase
      .from('terra_connections')
      .select('athlete_id, provider')
      .eq('terra_user_id', terraUserId)
      .maybeSingle();
    if (!connection) {
      console.log('[terra-webhook] No athlete found for terra_user_id:', terraUserId);
      return new Response(JSON.stringify({ error: 'Athlete not found' }), { status: 404 });
    }

    const { data: athlete } = await supabase
      .from('athletes')
      .select('id, selected_leagues, date_of_birth, observed_max_hr, max_hr')
      .eq('id', connection.athlete_id)
      .single();
    if (!athlete) {
      return new Response(JSON.stringify({ error: 'Athlete not found' }), { status: 404 });
    }

    const workouts = data?.workouts ?? (Array.isArray(data) ? data : []);
    const { inserted, skipped } = await processTerraWorkouts({
      supabase,
      athlete: athlete as AthleteRow,
      seasonId: season?.id ?? null,
      provider: String(connection.provider ?? 'unknown'),
      workouts,
    });

    console.log(`[terra-webhook] Processed: inserted=${inserted}, skipped=${skipped}`);
    return new Response(JSON.stringify({ inserted, skipped }), { status: 200 });
  } catch (err) {
    console.error('[terra-webhook] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
