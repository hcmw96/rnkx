import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEvent, upsertContact } from '../_shared/loops.ts';
import { getServiceRoleKey } from '../_shared/pushAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Loops event name — confirm against Shaun’s spec. */
export const FIRST_WORKOUT_SCORED_EVENT = 'firstWorkoutScored';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function firstNameFromDisplayName(displayName: string | null | undefined): string {
  const token = displayName?.trim().split(/\s+/)[0];
  return token ?? '';
}

function positiveScore(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

function leagueFromKey(leagueKey: 'run' | 'engine'): 'RUN' | 'ENGINE' {
  return leagueKey === 'run' ? 'RUN' : 'ENGINE';
}

function leagueAndScoreFromWorkout(workout: {
  engine_score?: unknown;
  run_score?: unknown;
}): { league: 'RUN' | 'ENGINE'; leagueKey: 'run' | 'engine'; score: number } | null {
  const run = positiveScore(workout.run_score);
  if (run != null) return { league: 'RUN', leagueKey: 'run', score: run };
  const engine = positiveScore(workout.engine_score);
  if (engine != null) return { league: 'ENGINE', leagueKey: 'engine', score: engine };
  return null;
}

function serviceRoleKeyCandidates(): string[] {
  const keys = [
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    Deno.env.get('service_role_key'),
    Deno.env.get('SERVICE_ROLE_KEY'),
  ]
    .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    .map((k) => k.trim());
  return [...new Set(keys)];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getServiceRoleKey();
  if (!supabaseUrl || !serviceKey) {
    console.error('[loops-first-workout] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ ok: false, skipped: true });
  }

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '')?.trim() ?? '';
  if (!token) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const isServiceRole = serviceRoleKeyCandidates().includes(token);

  let callerUserId: string | null = null;
  let emailFromJwt = '';
  if (!isServiceRole) {
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(token);
    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }
    callerUserId = user.id;
    emailFromJwt = user.email?.trim().toLowerCase() ?? '';
  }

  let body: { athleteId?: unknown };
  try {
    body = (await req.json()) as { athleteId?: unknown };
  } catch {
    console.error('[loops-first-workout] invalid JSON body');
    return json({ ok: false, skipped: true });
  }

  const athleteId = typeof body.athleteId === 'string' ? body.athleteId.trim() : '';
  if (!athleteId) {
    console.error('[loops-first-workout] missing athleteId');
    return json({ ok: false, skipped: true });
  }

  try {
    const { data: athlete, error: athleteErr } = await admin
      .from('athletes')
      .select('id, user_id, display_name')
      .eq('id', athleteId)
      .maybeSingle();

    if (athleteErr) {
      console.error('[loops-first-workout] athlete lookup', athleteErr);
      return json({ ok: false, skipped: true });
    }

    if (!athlete) {
      console.error('[loops-first-workout] athlete not found', athleteId);
      return json({ ok: false, skipped: true });
    }

    if (callerUserId) {
      const ownsRow =
        String(athlete.id) === callerUserId || String(athlete.user_id ?? '') === callerUserId;
      if (!ownsRow) {
        console.error('[loops-first-workout] athlete not owned by caller', athleteId);
        return json({ ok: false, skipped: true });
      }
    }

    const [{ count: workoutCount, error: workoutCountErr }, { count: activityCount, error: activityCountErr }] =
      await Promise.all([
        admin
          .from('workouts')
          .select('id', { count: 'exact', head: true })
          .eq('athlete_id', athleteId)
          .eq('status', 'scored'),
        admin
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('athlete_id', athleteId)
          .eq('status', 'scored'),
      ]);

    if (workoutCountErr) {
      console.error('[loops-first-workout] scored workouts count', workoutCountErr);
      return json({ ok: false, skipped: true });
    }
    if (activityCountErr) {
      console.error('[loops-first-workout] scored activities count', activityCountErr);
      return json({ ok: false, skipped: true });
    }

    const scoredWorkouts = workoutCount ?? 0;
    const scoredActivities = activityCount ?? 0;
    const scoredTotal = scoredWorkouts + scoredActivities;

    if (scoredTotal === 0) {
      console.log('[loops-first-workout] skip, no scored workout', athleteId);
      return json({ ok: true, skipped: true });
    }

    if (scoredTotal > 1) {
      console.log('[loops-first-workout] skip, not first scored workout', {
        athleteId,
        scoredWorkouts,
        scoredActivities,
      });
      return json({ ok: true, skipped: true });
    }

    let scored: { league: 'RUN' | 'ENGINE'; leagueKey: 'run' | 'engine'; score: number } | null = null;

    if (scoredWorkouts === 1) {
      const { data: workout, error: workoutErr } = await admin
        .from('workouts')
        .select('id, engine_score, run_score')
        .eq('athlete_id', athleteId)
        .eq('status', 'scored')
        .maybeSingle();

      if (workoutErr) {
        console.error('[loops-first-workout] scored workout lookup', workoutErr);
        return json({ ok: false, skipped: true });
      }
      scored = workout ? leagueAndScoreFromWorkout(workout) : null;
    } else {
      const { data: activity, error: activityErr } = await admin
        .from('activities')
        .select('id, league_type, duration_minutes, avg_hr_percent, avg_pace_seconds')
        .eq('athlete_id', athleteId)
        .eq('status', 'scored')
        .maybeSingle();

      if (activityErr) {
        console.error('[loops-first-workout] scored activity lookup', activityErr);
        return json({ ok: false, skipped: true });
      }
      if (activity) {
        const leagueKey = activity.league_type === 'run' ? 'run' : 'engine';
        const { data: scoreRaw, error: scoreErr } = await admin.rpc('calculate_activity_score', {
          p_league_type: leagueKey,
          p_duration_minutes: activity.duration_minutes,
          p_avg_hr_percent: activity.avg_hr_percent,
          p_avg_pace_seconds: activity.avg_pace_seconds,
        });
        if (scoreErr) {
          console.error('[loops-first-workout] calculate_activity_score', scoreErr);
          return json({ ok: false, skipped: true });
        }
        const score = positiveScore(scoreRaw);
        if (score != null) {
          scored = { league: leagueFromKey(leagueKey), leagueKey, score };
        }
      }
    }

    if (!scored) {
      console.error('[loops-first-workout] scored row has no league score', athleteId);
      return json({ ok: false, skipped: true });
    }

    const { data: season, error: seasonErr } = await admin
      .from('seasons')
      .select('id, name')
      .eq('is_active', true)
      .maybeSingle();

    if (seasonErr) {
      console.error('[loops-first-workout] seasons query error', seasonErr);
      return json({ ok: false, skipped: true });
    }
    if (season == null) {
      console.warn('[loops-first-workout] seasons query returned nothing');
      return json({ ok: false, skipped: true });
    }

    const seasonId = typeof season.id === 'string' ? season.id : '';
    const seasonName = typeof season.name === 'string' ? season.name.trim() : '';
    if (!seasonId || !seasonName) {
      console.error('[loops-first-workout] missing active season', { athleteId, season });
      return json({ ok: false, skipped: true });
    }

    const { data: boardRows, error: boardErr } = await admin
      .from('season_division_leaderboard')
      .select('rank, division')
      .eq('id', athleteId)
      .eq('season_id', seasonId)
      .eq('league', scored.leagueKey)
      .limit(1);

    if (boardErr) {
      console.error('[loops-first-workout] leaderboard lookup', boardErr);
      return json({ ok: false, skipped: true });
    }

    const board = (boardRows ?? [])[0] as { rank?: unknown; division?: unknown } | undefined;
    const rankN = Number(board?.rank);
    const currentRank = Number.isFinite(rankN) && rankN > 0 ? Math.round(rankN) : null;
    const currentDivision = typeof board?.division === 'string' ? board.division.trim() : '';

    if (currentRank == null || !currentDivision) {
      console.error('[loops-first-workout] missing rank or division', {
        athleteId,
        league: scored.leagueKey,
        board: board ?? null,
      });
      return json({ ok: false, skipped: true });
    }

    let email = emailFromJwt;
    if (!email) {
      const authUserId = String(athlete.user_id ?? athlete.id);
      const { data: authUser, error: authUserErr } = await admin.auth.admin.getUserById(authUserId);
      if (authUserErr) {
        console.error('[loops-first-workout] auth user lookup', authUserErr);
        return json({ ok: false, skipped: true });
      }
      email = authUser.user?.email?.trim().toLowerCase() ?? '';
    }

    if (!email) {
      console.error('[loops-first-workout] missing email', athleteId);
      return json({ ok: false, skipped: true });
    }

    const firstName = firstNameFromDisplayName(athlete.display_name as string | null);
    const workoutType = scored.league === 'RUN' ? 'Run' : 'Engine';

    const contactBody = {
      email,
      ...(firstName ? { firstName } : {}),
      league: scored.league,
      currentRank,
      currentDivision,
      seasonName,
    };
    const eventBody = {
      email,
      eventName: FIRST_WORKOUT_SCORED_EVENT,
      eventProperties: {
        workoutType,
        workoutScore: scored.score,
      },
    };

    console.log('[loops-first-workout] contacts/update', contactBody);
    await upsertContact(email, {
      ...(firstName ? { firstName } : {}),
      league: scored.league,
      currentRank,
      currentDivision,
      seasonName,
    });
    console.log('[loops-first-workout] events/send', eventBody);
    await sendEvent(email, FIRST_WORKOUT_SCORED_EVENT, eventBody.eventProperties);

    console.log('[loops-first-workout] sent', { athleteId, event: FIRST_WORKOUT_SCORED_EVENT });
    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[loops-first-workout] Loops failed', message);
    return json({ ok: false });
  }
});
