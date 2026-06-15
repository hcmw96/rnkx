import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateNotifyRequest, notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';
import { getOneSignalApiKey, getOneSignalAppId } from '../_shared/onesignalEnv.ts';
import { buildOneSignalPayload } from '../_shared/onesignalPush.ts';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

function sanitize(s: string, max: number): string {
  const t = s.replace(/[\r\n\u0000]/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function formatLeagueType(t: string): string {
  const s = t.trim();
  if (!s) return 'workout';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function leagueCategory(leagueType: string): string {
  const s = leagueType.trim().toLowerCase();
  return s === 'run' ? 'run' : 'engine';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: notifyCorsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return notifyJson({ success: true });
    }

    const auth = await authenticateNotifyRequest(req);
    if (!auth) {
      return notifyJson({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const appId = getOneSignalAppId();
    const apiKey = getOneSignalApiKey();

    if (!supabaseUrl || !serviceKey || !appId || !apiKey) {
      console.error('[notify-workout-scored] missing env');
      return notifyJson({ success: true });
    }

    let body: {
      athlete_id?: string;
      score?: number;
      league_type?: string;
      rank?: number;
    };
    try {
      body = await req.json();
    } catch {
      return notifyJson({ success: true });
    }

    const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
    const score = typeof body.score === 'number' && Number.isFinite(body.score) ? body.score : null;
    const leagueType = typeof body.league_type === 'string' ? body.league_type : 'workout';
    let rank = typeof body.rank === 'number' && Number.isFinite(body.rank) ? body.rank : null;

    if (!athleteId || score === null) {
      console.warn('[notify-workout-scored] missing athlete_id or score');
      return notifyJson({ success: true });
    }

    if (auth.kind === 'user' && auth.athleteId !== athleteId) {
      return notifyJson({ success: false, error: 'Forbidden' }, 403);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: athlete, error: athErr } = await supabase
      .from('athletes')
      .select('id')
      .eq('id', athleteId)
      .maybeSingle();

    if (athErr) {
      console.error('[notify-workout-scored] athlete lookup', athErr);
      return notifyJson({ success: true });
    }
    if (!athlete?.id) {
      console.warn('[notify-workout-scored] unknown athlete', athleteId);
      return notifyJson({ success: true });
    }
    const externalUserId = String(athlete.id);

    if (rank === null) {
      const { data: season } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();
      if (season?.id) {
        const { data: rankData, error: rankErr } = await supabase.rpc('category_leaderboard_rank', {
          p_athlete_id: athleteId,
          p_season_id: season.id,
          p_category: leagueCategory(leagueType),
        });
        if (!rankErr && rankData != null && Number.isFinite(Number(rankData))) {
          const n = Number(rankData);
          rank = n >= 999999 ? null : n;
        }
      }
    }

    const lt = formatLeagueType(leagueType);
    const title = 'Workout scored! 💪';
    const message =
      rank != null && rank > 0
        ? `Your ${lt} workout scored ${score} pts — you're ranked #${rank}!`
        : `Your ${lt} workout scored ${score} pts!`;

    const osRes = await fetch(ONESIGNAL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(
        buildOneSignalPayload({
          appId,
          externalUserIds: [externalUserId],
          title,
          message,
          path: '/app',
        }),
      ),
    });

    const osJson = await osRes.json().catch(() => ({}));
    const errors = (osJson as { errors?: unknown }).errors ?? null;
    console.log('[notify-workout-scored] onesignal result', {
      athleteId,
      externalUserId,
      status: osRes.status,
      ok: osRes.ok,
      oneSignalId: (osJson as { id?: unknown }).id ?? null,
      errors,
    });
    if (!osRes.ok) {
      console.error('[notify-workout-scored] OneSignal', osRes.status, osJson);
    } else if (errors) {
      console.warn('[notify-workout-scored] OneSignal delivered with errors', { externalUserId, errors });
    }
  } catch (e) {
    console.error('[notify-workout-scored]', e);
  }

  return notifyJson({ success: true });
});
