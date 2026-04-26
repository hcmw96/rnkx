import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // TODO: Verify Terra signature and map payload to process_activity RPC calls.
  const payload = await req.json();

  return new Response(JSON.stringify({ received: true, payload }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
