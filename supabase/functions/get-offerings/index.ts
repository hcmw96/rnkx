import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OFFERING_ID = 'RNKXPREMIUM_MONTHLY';

/** Public SDK keys (appl_/goog_) use Basic; secret keys (sk_) use Bearer. */
function rcAuthHeader(apiKey: string): string {
  if (apiKey.startsWith('sk_')) {
    return `Bearer ${apiKey}`;
  }
  const token = btoa(`${apiKey}:`);
  return `Basic ${token}`;
}

type PackageOut = {
  packageIdentifier: string;
  productId: string;
  lengthLabel: string;
  periodMonths: number;
  title: string;
};

function lengthFromId(id: string): { lengthLabel: string; periodMonths: number; cadence: string } {
  const lower = id.toLowerCase();
  if (lower.includes('week') || lower === '$rc_weekly') {
    return { lengthLabel: '1 week', periodMonths: 0, cadence: 'Weekly' };
  }
  if (lower.includes('year') || lower.includes('annual') || lower.includes('yearly') || lower === '$rc_annual') {
    return { lengthLabel: '1 year', periodMonths: 12, cadence: 'Yearly' };
  }
  return { lengthLabel: '1 month', periodMonths: 1, cadence: 'Monthly' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rcSecretKey = Deno.env.get('REVENUECAT_SECRET_KEY')?.trim();
  if (!rcSecretKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration', packages: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let appUserId = '$RCAnonymousID:rnkx-offerings';
  let platform: 'ios' | 'android' = 'ios';
  try {
    if (req.method === 'POST') {
      const body = (await req.json()) as { appUserId?: string; platform?: string };
      if (typeof body.appUserId === 'string' && body.appUserId.trim() !== '') {
        appUserId = body.appUserId.trim();
      }
      if (body.platform === 'android') platform = 'android';
    }
  } catch {
    // keep defaults
  }

  const offeringsUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}/offerings`;
  const rcRes = await fetch(offeringsUrl, {
    headers: {
      Authorization: rcAuthHeader(rcSecretKey),
      'X-Platform': platform,
      'Content-Type': 'application/json',
    },
  });

  if (!rcRes.ok) {
    const detail = await rcRes.text();
    console.error('[get-offerings] RevenueCat error', rcRes.status, detail);
    return new Response(JSON.stringify({ error: 'Failed to fetch offerings', packages: [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = (await rcRes.json()) as {
    current_offering_id?: string;
    offerings?: Array<{
      identifier?: string;
      packages?: Array<{ identifier?: string; platform_product_identifier?: string }>;
    }>;
  };

  const offerings = body.offerings ?? [];
  const preferred =
    offerings.find((o) => o.identifier === OFFERING_ID) ??
    offerings.find((o) => o.identifier === body.current_offering_id) ??
    offerings[0];

  const packages: PackageOut[] = [];
  for (const pkg of preferred?.packages ?? []) {
    const productId = pkg.platform_product_identifier?.trim();
    const packageIdentifier = pkg.identifier?.trim() ?? productId ?? '';
    if (!productId) continue;
    const len = lengthFromId(`${packageIdentifier} ${productId}`);
    packages.push({
      packageIdentifier,
      productId,
      lengthLabel: len.lengthLabel,
      periodMonths: len.periodMonths,
      title: `RNKX Premium — ${len.cadence}`,
    });
  }

  return new Response(JSON.stringify({ offeringId: preferred?.identifier ?? null, packages }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
