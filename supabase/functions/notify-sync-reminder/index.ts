import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildOneSignalPayload, pathFromUrl } from '../_shared/onesignalPush.ts';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';
const SYNC_REMINDER_URL = 'https://rnkx.netlify.app/app/profile';
const SYNC_REMINDER_PATH = pathFromUrl(SYNC_REMINDER_URL, '/app/profile');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AthleteRow = {
  id: string;
  wearables: unknown;
  last_synced: string | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function startOfTodayUtcIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function hasAppleWatch(wearables: unknown): boolean {
  if (!Array.isArray(wearables)) return false;
  return wearables.some((w) => {
    const v = String(w).toLowerCase();
    return v === 'apple_watch' || v === 'apple';
  });
}

function isEligible(row: AthleteRow, todayStartIso: string): boolean {
  if (!hasAppleWatch(row.wearables)) return false;
  if (row.last_synced == null || row.last_synced === '') return true;
  return row.last_synced < todayStartIso;
}

async function sendSyncReminderPush(
  appId: string,
  apiKey: string,
  athleteId: string,
): Promise<boolean> {
  const osRes = await fetch(ONESIGNAL_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(
      buildOneSignalPayload({
        appId,
        externalUserIds: [athleteId],
        title: 'Time to sync! ⚡',
        message: 'Log your workouts to stay on the leaderboard',
        path: SYNC_REMINDER_PATH,
      }),
    ),
  });

  if (!osRes.ok) {
    const osJson = await osRes.json().catch(() => ({}));
    console.error('[notify-sync-reminder] OneSignal', athleteId, osRes.status, osJson);
    return false;
  }

  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appId = Deno.env.get('ONESIGNAL_APP_ID')?.trim();
  const apiKey = Deno.env.get('ONESIGNAL_API_KEY')?.trim();

  if (!supabaseUrl || !serviceKey) {
    console.error('[notify-sync-reminder] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfiguration' }, 500);
  }

  if (!appId || !apiKey) {
    console.error('[notify-sync-reminder] missing ONESIGNAL_APP_ID or ONESIGNAL_API_KEY');
    return json({ error: 'Server misconfiguration' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${serviceKey}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { athlete_id?: string } = {};
  try {
    const raw = await req.text();
    if (raw.trim()) {
      body = JSON.parse(raw) as { athlete_id?: string };
    }
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const targetAthleteId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
  const todayStartIso = startOfTodayUtcIso();
  const supabase = createClient(supabaseUrl, serviceKey);

  let candidates: AthleteRow[] = [];

  if (targetAthleteId) {
    const { data, error } = await supabase
      .from('athletes')
      .select('id, wearables, last_synced')
      .eq('id', targetAthleteId)
      .maybeSingle();

    if (error) {
      console.error('[notify-sync-reminder] athlete lookup', error);
      return json({ error: error.message }, 500);
    }

    if (data) {
      candidates = [data as AthleteRow];
    }
  } else {
    const { data, error } = await supabase
      .from('athletes')
      .select('id, wearables, last_synced')
      .or(`last_synced.is.null,last_synced.lt.${todayStartIso}`);

    if (error) {
      console.error('[notify-sync-reminder] list athletes', error);
      return json({ error: error.message }, 500);
    }

    candidates = (data ?? []) as AthleteRow[];
  }

  let sent = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (!isEligible(row, todayStartIso)) {
      skipped += 1;
      continue;
    }

    const ok = await sendSyncReminderPush(appId, apiKey, row.id);
    if (ok) {
      sent += 1;
      console.log('[notify-sync-reminder] sent', { athlete_id: row.id });
    } else {
      skipped += 1;
    }
  }

  const summary = { sent, skipped };
  console.log('[notify-sync-reminder] summary', summary);
  return json(summary);
});
