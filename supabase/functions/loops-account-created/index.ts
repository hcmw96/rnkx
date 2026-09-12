import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendEvent, upsertContact } from '../_shared/loops.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Loops event name — confirm against Shaun’s spec. */
export const ACCOUNT_CREATED_EVENT = 'accountCreated';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

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

function londonDateParts(iso: string): { day: number; month: number; year: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  return { day, month, year };
}

function formatDayMonth(iso: string): string | null {
  const parts = londonDateParts(iso);
  if (!parts) return null;
  const month = MONTHS[parts.month - 1];
  if (!month) return null;
  return `${parts.day} ${month}`;
}

function isoDateLondon(iso: string): string | null {
  const parts = londonDateParts(iso);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function seasonDatesDisplay(startsAt: string, endsAt: string): string | null {
  const start = formatDayMonth(startsAt);
  const end = formatDayMonth(endsAt);
  if (!start || !end) return null;
  return `${start} \u2013 ${end}`;
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
  if (!supabaseUrl || !serviceKey) {
    console.error('[loops-account-created] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
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

  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(token);
  if (userErr || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { athleteId?: unknown; email?: unknown };
  try {
    body = (await req.json()) as { athleteId?: unknown; email?: unknown };
  } catch {
    console.error('[loops-account-created] invalid JSON body');
    return json({ ok: false, skipped: true });
  }

  const athleteId = typeof body.athleteId === 'string' ? body.athleteId.trim() : '';
  const bodyEmail = typeof body.email === 'string' ? body.email.trim() : '';
  const email = (user.email?.trim() || bodyEmail).toLowerCase();

  if (!athleteId || !email) {
    console.error('[loops-account-created] missing athleteId or email');
    return json({ ok: false, skipped: true });
  }

  try {
    const { data: athlete, error: athleteErr } = await admin
      .from('athletes')
      .select('id, user_id, display_name')
      .eq('id', athleteId)
      .maybeSingle();

    if (athleteErr) {
      console.error('[loops-account-created] athlete lookup', athleteErr);
      return json({ ok: false, skipped: true });
    }

    const ownsRow =
      athlete &&
      (String(athlete.id) === user.id || String(athlete.user_id ?? '') === user.id);
    if (!ownsRow) {
      console.error('[loops-account-created] athlete not found or not owned by caller', athleteId);
      return json({ ok: false, skipped: true });
    }

    const { data: season, error: seasonErr } = await admin
      .from('seasons')
      .select('name, starts_at, ends_at')
      .eq('is_active', true)
      .maybeSingle();

    if (seasonErr) {
      console.error('[loops-account-created] seasons query error', seasonErr);
    } else if (season == null) {
      console.warn('[loops-account-created] seasons query returned nothing');
    } else {
      console.log('[loops-account-created] seasons query row', season);
    }

    const startsAt = typeof season?.starts_at === 'string' ? season.starts_at : '';
    const endsAt = typeof season?.ends_at === 'string' ? season.ends_at : '';
    const seasonName = typeof season?.name === 'string' ? season.name.trim() : '';
    const datesDisplay = startsAt && endsAt ? seasonDatesDisplay(startsAt, endsAt) : null;
    const seasonStartDate = startsAt ? isoDateLondon(startsAt) : null;
    const seasonEndDate = endsAt ? isoDateLondon(endsAt) : null;

    console.log('[loops-account-created] seasonName', JSON.stringify(seasonName));
    console.log('[loops-account-created] seasonStartDate', JSON.stringify(seasonStartDate));
    console.log('[loops-account-created] seasonEndDate', JSON.stringify(seasonEndDate));
    console.log('[loops-account-created] seasonDatesDisplay', JSON.stringify(datesDisplay));

    if (seasonErr || !datesDisplay || !seasonStartDate || !seasonEndDate || !seasonName) {
      console.error('[loops-account-created] missing active season dates; email would not send', {
        athleteId,
        seasonName,
        startsAt,
        endsAt,
      });
      return json({ ok: false, skipped: true });
    }

    const firstName = firstNameFromDisplayName(athlete.display_name as string | null);

    const loopsProperties = {
      ...(firstName ? { firstName } : {}),
      userId: String(athlete.id),
      seasonName,
      seasonStartDate,
      seasonEndDate,
      seasonDatesDisplay: datesDisplay,
    };

    console.log('[loops-account-created] upsertContact properties', loopsProperties);
    await upsertContact(email, loopsProperties);
    console.log('[loops-account-created] sendEvent properties', loopsProperties);
    await sendEvent(email, ACCOUNT_CREATED_EVENT, loopsProperties);

    console.log('[loops-account-created] sent', { athleteId, event: ACCOUNT_CREATED_EVENT });
    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[loops-account-created] Loops failed', message);
    return json({ ok: false });
  }
});
