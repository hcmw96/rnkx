import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reference_id } = await req.json();

    if (!reference_id) {
      return new Response(JSON.stringify({ error: "reference_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.tryterra.co/v2/auth/generateWidgetSession", {
      method: "POST",
      headers: {
        "x-api-key": "RH_SYC48243Za9tDO5XnsFt9I0j3Jg1x",
        "dev-id": "rnkx-prod-HQg8bWyjdQ",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference_id,
        providers: "GARMIN,POLAR,COROS,FITBIT,OURA,SAMSUNG,STRAVA,WHOOP",
        language: "en",
        auth_success_redirect_url: "rnkx://app/profile",
        auth_failure_redirect_url: "rnkx://app/profile",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Terra API error:", data);
      return new Response(JSON.stringify({ error: "Terra API error", details: data }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ session_id: data.session_id, url: data.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("terra-widget-session error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
