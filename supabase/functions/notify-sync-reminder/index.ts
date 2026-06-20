import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateNotifyRequest, createServiceRoleClient, notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';
import { outcomeFromOneSignal, sendOneSignalPush } from '../_shared/onesignalSend.ts';
import { pathFromUrl } from '../_shared/onesignalPush.ts';
import { getOneSignalCredentials } from '../_shared/onesignalSend.ts';

const SYNC_REMINDER_PATH = pathFromUrl('https://rnkx.netlify.app/app/profile', '/app/profile');

type AthleteRow = {
  id: string;
  wearables: unknown;
};

function hasAppleWatch(wearables: unknown): boolean {
  if (!Array.isArray(wearables)) return false;
  return wearables.some((w) => String(w).trim().toLowerCase() === 'apple_watch');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: notifyCorsHeaders });
  }
  if (req.method !== 'POST') {
    return notifyJson({ error: 'Method not allowed' }, 405);
  }

  const auth = await authenticateNotifyRequest(req);
  if (!auth || auth.kind !== 'service') {
    return notifyJson({ error: 'Unauthorized' }, 401);
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    console.error('[notify-sync-reminder] missing service role key');
    return notifyJson({ error: 'Server misconfiguration' }, 500);
  }
  if (!getOneSignalCredentials()) {
    console.error('[notify-sync-reminder] missing OneSignal credentials');
    return notifyJson({ error: 'Server misconfiguration' }, 500);
  }

  let body: { athlete_id?: string } = {};
  try {
    const raw = await req.text();
    if (raw.trim()) {
      body = JSON.parse(raw) as { athlete_id?: string };
    }
  } catch {
    return notifyJson({ error: 'Invalid JSON' }, 400);
  }

  const targetAthleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';

  let candidates: AthleteRow[] = [];

  if (targetAthleteId) {
    const { data, error } = await supabase
      .from('athletes')
      .select('id, wearables')
      .eq('id', targetAthleteId)
      .maybeSingle();

    if (error) {
      console.error('[notify-sync-reminder] athlete lookup', error);
      return notifyJson({ error: error.message }, 500);
    }
    if (data) candidates = [data as AthleteRow];
  } else {
    const { data, error } = await supabase.from('athletes').select('id, wearables');

    if (error) {
      console.error('[notify-sync-reminder] list athletes', error);
      return notifyJson({ error: error.message }, 500);
    }

    candidates = (data ?? []) as AthleteRow[];
  }

  let sent = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (!hasAppleWatch(row.wearables)) {
      skipped += 1;
      continue;
    }

    const osResult = await sendOneSignalPush({
      appId: '',
      externalUserIds: [String(row.id)],
      title: 'Sync your workouts ⌚',
      message: 'Sync before Sunday midnight GMT to make sure your workouts count this week.',
      path: SYNC_REMINDER_PATH,
    });

    if (osResult.httpOk && !osResult.errors) {
      sent += 1;
      console.log('[notify-sync-reminder] sent', { athlete_id: row.id });
    } else {
      skipped += 1;
      console.warn('[notify-sync-reminder] skip', { athlete_id: row.id, status: osResult.status, errors: osResult.errors });
    }
  }

  const summary = { sent, skipped };
  console.log('[notify-sync-reminder] summary', summary);
  return notifyJson(summary);
});
