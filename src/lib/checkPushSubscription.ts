import { supabase } from '@/services/supabase';

export type PushSubscriptionStatus = {
  linked: boolean;
  subscribed: boolean;
  subscriptionCount: number;
  message?: string;
};

/** Server-side OneSignal lookup — confirms setonesignalplayerid linked athletes.id. */
export async function fetchPushSubscriptionStatus(
  athleteId: string,
): Promise<PushSubscriptionStatus | null> {
  const id = athleteId.trim();
  if (!id) return null;

  const { data, error } = await supabase.functions.invoke('check-push-subscription', {
    body: { athlete_id: id },
  });

  if (error) {
    console.warn('[Push] check-push-subscription failed:', error.message);
    return null;
  }

  const payload = data as {
    linked?: boolean;
    subscribed?: boolean;
    subscription_count?: number;
    message?: string;
  } | null;

  if (!payload) return null;

  return {
    linked: payload.linked === true,
    subscribed: payload.subscribed === true,
    subscriptionCount: Number(payload.subscription_count) || 0,
    message: typeof payload.message === 'string' ? payload.message : undefined,
  };
}
