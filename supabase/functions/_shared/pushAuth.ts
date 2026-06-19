import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const notifyCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function notifyJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...notifyCorsHeaders, 'Content-Type': 'application/json' },
  });
}

export type NotifyAuth =
  | { kind: 'service' }
  | { kind: 'user'; authUserId: string; athleteId: string | null };

const DEFAULT_SUPABASE_URL = 'https://vuhnmlixouvghvyjwrdv.supabase.co';

/** SUPABASE_URL secret or vault `supabase_url` fallback. */
export function getSupabaseUrl(): string {
  return (
    Deno.env.get('SUPABASE_URL')?.trim() ||
    Deno.env.get('supabase_url')?.trim() ||
    DEFAULT_SUPABASE_URL
  );
}

/** Prefer platform-injected key; fall back to unprefixed vault secret `service_role_key`. */
export function getServiceRoleKey(): string | undefined {
  return (
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
    Deno.env.get('service_role_key')?.trim() ||
    Deno.env.get('SERVICE_ROLE_KEY')?.trim() ||
    undefined
  );
}

function getServiceRoleKeyCandidates(): string[] {
  const keys = [
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    Deno.env.get('service_role_key'),
    Deno.env.get('SERVICE_ROLE_KEY'),
  ]
    .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    .map((k) => k.trim());
  return [...new Set(keys)];
}

export async function resolveAthleteIdForAuthUser(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<string | null> {
  const [byUserId, byId] = await Promise.all([
    supabase.from('athletes').select('id').eq('user_id', authUserId).maybeSingle(),
    supabase.from('athletes').select('id').eq('id', authUserId).maybeSingle(),
  ]);
  const id = byUserId.data?.id ?? byId.data?.id;
  return id ? String(id) : null;
}

/** Accept service-role bearer (pg_net/cron) or a logged-in user JWT. */
export async function authenticateNotifyRequest(req: Request): Promise<NotifyAuth | null> {
  const supabaseUrl = getSupabaseUrl();
  const serviceKey = getServiceRoleKey();
  if (!serviceKey) {
    console.error('[pushAuth] no service role key in env (SUPABASE_SERVICE_ROLE_KEY or service_role_key)');
    return null;
  }

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '')?.trim() ?? '';
  if (!token) return null;

  if (getServiceRoleKeyCandidates().includes(token)) {
    return { kind: 'service' };
  }

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (!anonKey) {
    console.error('[pushAuth] SUPABASE_ANON_KEY missing — cannot validate user JWT');
    return null;
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;

  const admin = createClient(supabaseUrl, serviceKey);
  const athleteId = await resolveAthleteIdForAuthUser(admin, user.id);
  return { kind: 'user', authUserId: user.id, athleteId };
}

export function createServiceRoleClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!key) return null;
  return createClient(url, key);
}
