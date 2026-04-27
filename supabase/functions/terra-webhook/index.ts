import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.json();
    console.log('[terra-webhook] Received:', JSON.stringify(body).substring(0, 500));

    const { type, user, data } = body;

    // Only process activity/workout data
    if (type !== 'activity' && type !== 'workouts') {
      return new Response(JSON.stringify({ status: 'ignored', type }), { status: 200 });
    }

    const terraUserId = user?.user_id;
    if (!terraUserId) {
      return new Response(JSON.stringify({ error: 'No user_id' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find athlete from terra_connections
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

    const { data: season } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .maybeSingle();

    const workouts = data?.workouts ?? (Array.isArray(data) ? data : []);
    let inserted = 0;
    let skipped = 0;
    let sessionPeakMaxHr = 0;

    for (const workout of workouts) {
      const durationMin = Math.round((workout.active_durations_data?.duration_in_seconds ?? 0) / 60);
      if (durationMin < 15) { skipped++; continue; }

      const activityDate = workout.metadata?.start_time?.split('T')[0];
      if (!activityDate) { skipped++; continue; }

      // Heart rate
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

      // Distance and pace
      const distanceMeters = workout.distance_data?.summary?.distance_meters ?? null;
      const avgSpeedMps = workout.movement_data?.avg_speed_meters_per_second ?? null;
      const avgPaceSeconds = avgSpeedMps && avgSpeedMps > 0 ? Math.round(1000 / avgSpeedMps) : null;

      // Activity type
      const activityType = workout.metadata?.type?.toLowerCase() ?? '';
      const isRun = ['running', 'jogging', 'trail_running', 'outdoor_running', 'indoor_running'].includes(activityType);

      const leagues = athlete.selected_leagues ?? [];

      // Determine league
      let leagueType: string | null = null;
      if (isRun && leagues.includes('run') && avgPaceSeconds) {
        leagueType = 'run';
      } else if (!isRun && leagues.includes('engine') && avgHrPercent && avgHrPercent >= 45) {
        leagueType = 'engine';
      } else if (isRun && leagues.includes('engine') && avgHrPercent && avgHrPercent >= 45) {
        leagueType = 'engine'; // fallback for run without pace
      }

      if (!leagueType) { skipped++; continue; }

      const sourceId = `terra_${connection.provider}_${workout.metadata?.workout_id ?? activityDate + '_' + durationMin}`;

      const { error } = await supabase.from('activities').insert({
        athlete_id: athlete.id,
        season_id: season?.id ?? null,
        league_type: leagueType,
        activity_type: isRun ? 'outdoor_run' : 'engine',
        duration_minutes: Math.min(durationMin, 120),
        avg_pace_seconds: avgPaceSeconds,
        avg_hr_percent: avgHrPercent,
        activity_date: activityDate,
        source: connection.provider,
        source_id: sourceId,
      });

      if (error && error.code !== '23505') {
        console.error('[terra-webhook] Insert error:', error);
      } else if (!error) {
        inserted++;
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

    console.log(`[terra-webhook] Processed: inserted=${inserted}, skipped=${skipped}`);
    return new Response(JSON.stringify({ inserted, skipped }), { status: 200 });

  } catch (err) {
    console.error('[terra-webhook] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
