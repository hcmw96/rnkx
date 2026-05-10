import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Deletes the caller's public profile data and removes their auth user via the Admin API.
 * Requires a valid user JWT (verify_jwt = true in config). Uses the service role only on the server.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '') ?? '';
  const {
    data: { user },
    error: userErr,
  } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const uid = user.id;

  const { data: athleteRows, error: athLookupErr } = await supabaseAdmin
    .from('athletes')
    .select('id')
    .or(`user_id.eq.${uid},id.eq.${uid}`)
    .limit(1);

  if (athLookupErr) {
    console.error('[delete-account] athlete lookup', athLookupErr);
    return new Response(JSON.stringify({ error: athLookupErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const athleteId = (athleteRows?.[0] as { id?: string } | undefined)?.id;

  if (athleteId) {
    const tables = ['activities', 'athlete_stats', 'workouts'] as const;
    for (const table of tables) {
      const { error } = await supabaseAdmin.from(table).delete().eq('athlete_id', athleteId);
      if (error) {
        const msg = error.message?.toLowerCase() ?? '';
        if (!msg.includes('relation') && !msg.includes('does not exist')) {
          console.warn(`[delete-account] ${table} delete:`, error.message);
        }
      }
    }

    const { error: delAthleteErr } = await supabaseAdmin.from('athletes').delete().eq('id', athleteId);
    if (delAthleteErr) {
      console.error('[delete-account] athletes delete', delAthleteErr);
      return new Response(JSON.stringify({ error: delAthleteErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const { error: adminErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
  if (adminErr) {
    console.error('[delete-account] admin.deleteUser', adminErr);
    return new Response(JSON.stringify({ error: adminErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
