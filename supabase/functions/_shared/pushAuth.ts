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
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return null;

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '')?.trim() ?? '';
  if (!token) return null;

  if (token === serviceKey) {
    return { kind: 'service' };
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
