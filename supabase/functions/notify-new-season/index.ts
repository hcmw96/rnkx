import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  authenticateNotifyRequest,
  createServiceRoleClient,
  notifyCorsHeaders,
  notifyJson,
} from '../_shared/pushAuth.ts';
import { getOneSignalCredentials } from '../_shared/onesignalSend.ts';
import { fanOutSeasonPush, formatDivisionsLine } from '../_shared/seasonPush.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: notifyCorsHeaders });
  if (req.method !== 'POST') return notifyJson({ error: 'Method not allowed' }, 405);

  const auth = await authenticateNotifyRequest(req);
  if (!auth || auth.kind !== 'service') return notifyJson({ error: 'Unauthorized' }, 401);

  const supabase = createServiceRoleClient();
  if (!supabase || !getOneSignalCredentials()) {
    return notifyJson({ error: 'Server misconfiguration' }, 500);
  }

  let body: { season_id?: string } = {};
  try {
    body = JSON.parse(await req.text()) as { season_id?: string };
  } catch {
    return notifyJson({ error: 'Invalid JSON' }, 400);
  }

  const seasonId = typeof body.season_id === 'string' ? body.season_id.trim() : '';
  if (!seasonId) return notifyJson({ error: 'season_id required' }, 400);

  try {
    const result = await fanOutSeasonPush({
      supabase,
      seasonId,
      title: 'New season is live',
      path: '/app/dashboard',
      logTag: 'notify-new-season',
      messageFor: (athlete, seasonName) =>
        `${seasonName} is underway. You're in — ${formatDivisionsLine(
          athlete.engine_division,
          athlete.run_division,
        )}.`,
    });
    return notifyJson(result);
  } catch (err) {
    console.error('[notify-new-season]', err);
    return notifyJson({ error: err instanceof Error ? err.message : 'failed' }, 500);
  }
});
