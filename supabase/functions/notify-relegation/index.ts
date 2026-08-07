import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  authenticateNotifyRequest,
  notifyCorsHeaders,
  notifyJson,
} from '../_shared/pushAuth.ts';
import { getOneSignalCredentials, sendOneSignalPush } from '../_shared/onesignalSend.ts';
import { leagueLabel } from '../_shared/seasonPush.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: notifyCorsHeaders });
  if (req.method !== 'POST') return notifyJson({ error: 'Method not allowed' }, 405);

  const auth = await authenticateNotifyRequest(req);
  if (!auth || auth.kind !== 'service') return notifyJson({ error: 'Unauthorized' }, 401);
  if (!getOneSignalCredentials()) return notifyJson({ error: 'Server misconfiguration' }, 500);

  let body: {
    athlete_id?: string;
    league?: string;
    from_division?: string;
    to_division?: string;
  } = {};
  try {
    body = JSON.parse(await req.text()) as typeof body;
  } catch {
    return notifyJson({ error: 'Invalid JSON' }, 400);
  }

  const athleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
  const league = body.league === 'run' ? 'run' : 'engine';
  const toDivision = (body.to_division ?? 'Open').trim();
  if (!athleteId) return notifyJson({ error: 'athlete_id required' }, 400);

  const osResult = await sendOneSignalPush({
    appId: '',
    externalUserIds: [athleteId],
    title: 'Relegated',
    message: `${leagueLabel(league)} — moved to ${toDivision}.`,
    path: '/app/profile',
  });

  return notifyJson({
    sent: osResult.httpOk && !osResult.errors ? 1 : 0,
    status: osResult.status,
    errors: osResult.errors,
  });
});
