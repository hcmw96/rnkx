/** OneSignal REST credentials — accept either secret name used in Supabase dashboard. */
export function getOneSignalAppId(): string | undefined {
  return Deno.env.get('ONESIGNAL_APP_ID')?.trim() || undefined;
}

export function getOneSignalApiKey(): string | undefined {
  return (
    Deno.env.get('ONESIGNAL_API_KEY')?.trim() ||
    Deno.env.get('ONESIGNAL_REST_API_KEY')?.trim() ||
    undefined
  );
}
