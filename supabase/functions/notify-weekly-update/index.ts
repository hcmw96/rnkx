import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  authenticateNotifyRequest,
  createServiceRoleClient,
  notifyCorsHeaders,
  notifyJson,
} from '../_shared/pushAuth.ts';
import { getOneSignalCredentials, sendOneSignalPush } from '../_shared/onesignalSend.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: notifyCorsHeaders });
  if (req.method !== 'POST') return notifyJson({ error: 'Method not allowed' }, 405);

  const auth = await authenticateNotifyRequest(req);
  if (!auth || auth.kind !== 'service') return notifyJson({ error: 'Unauthorized' }, 401);

  const supabase = createServiceRoleClient();
  if (!supabase || !getOneSignalCredentials()) {
    return notifyJson({ error: 'Server misconfiguration' }, 500);
  }

  let body: { season_id?: string; week_start?: string } = {};
  try {
    body = JSON.parse(await req.text()) as { season_id?: string; week_start?: string };
  } catch {
    return notifyJson({ error: 'Invalid JSON' }, 400);
  }

  const { data: athletes, error } = await supabase.from('athletes').select('id');
  if (error) return notifyJson({ error: error.message }, 500);

  const weekLabel = typeof body.week_start === 'string' ? body.week_start : 'this week';
  let sent = 0;
  let skipped = 0;

  for (const row of athletes ?? []) {
    const id = String((row as { id: string }).id);
    const osResult = await sendOneSignalPush({
      appId: '',
      externalUserIds: [id],
      title: 'Weekly update',
      message: `Your weekly consistency bonuses for the week of ${weekLabel} are in. Check the leaderboard.`,
      path: '/app/leaderboard',
    });
    if (osResult.httpOk && !osResult.errors) sent += 1;
    else skipped += 1;
  }

  return notifyJson({ sent, skipped, week_start: weekLabel });
});
