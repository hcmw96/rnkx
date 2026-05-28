import despia from 'despia-native';
import OneSignal from 'react-onesignal';
import { isDespiaIphoneUa } from '@/lib/despiaPlatform';

const PUSH_PERMISSION_PROMPT_KEY = 'rnkx_onesignal_permission_prompted';

let initPromise: Promise<void> | null = null;

function isNativeDespia(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { despia?: unknown }).despia;
}

export async function initOneSignal(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      if (!window.despia) return; // Skip on web browser
      await OneSignal.init({
        appId: '54875193-0dd4-48a1-89f6-d8d15db085c8',
        allowLocalhostAsSecureOrigin: true,
      });
    } catch (err) {
      console.warn('OneSignal init failed:', err);
    }
  })();
  return initPromise;
}

/**
 * Registers the device with OneSignal using the athlete row primary key.
 * Must be `athletes.id` (UUID), never `auth.users.id` / `athletes.user_id`.
 */
export async function setOneSignalExternalId(athleteId: string): Promise<void> {
  await registerPushForAthlete(athleteId);
}

/** True when native app has an active push subscription for the logged-in athlete. */
export async function isPushRegistered(): Promise<boolean> {
  if (!isNativeDespia()) return false;
  try {
    await initOneSignal();
    const sub = OneSignal.User.PushSubscription;
    return Boolean(sub.optedIn && sub.id);
  } catch {
    return false;
  }
}

/**
 * Links this device to `athletes.id` and ensures push is opted in.
 * Call on every authenticated session — OneSignal only delivers when the recipient is subscribed.
 */
export async function registerPushForAthlete(athleteId: string): Promise<void> {
  if (!isNativeDespia()) return;

  await initOneSignal();
  await OneSignal.login(athleteId);

  const subscribed = Boolean(OneSignal.User.PushSubscription.optedIn && OneSignal.User.PushSubscription.id);

  if (!subscribed) {
    await requestNativePushPermission();
    try {
      await OneSignal.User.PushSubscription.optIn();
    } catch (err) {
      console.warn('[OneSignal] optIn failed:', err);
    }
  }

  console.log('[OneSignal] register', {
    athleteId,
    externalId: OneSignal.User.externalId ?? null,
    optedIn: OneSignal.User.PushSubscription.optedIn ?? false,
    subscriptionId: OneSignal.User.PushSubscription.id ?? null,
  });
}

async function requestNativePushPermission(): Promise<void> {
  if (!isDespiaIphoneUa()) return;

  const alreadyPrompted = localStorage.getItem(PUSH_PERMISSION_PROMPT_KEY) === '1';

  if (!alreadyPrompted) {
    try {
      await despia('onesignal://requestPermission', ['oneSignalResponse']);
      localStorage.setItem(PUSH_PERMISSION_PROMPT_KEY, '1');
      return;
    } catch (err) {
      console.warn('[OneSignal] Despia permission request failed:', err);
    }
  }

  try {
    await OneSignal.Notifications.requestPermission();
  } catch (err) {
    console.warn('[OneSignal] SDK permission request failed:', err);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  return OneSignal.Notifications.requestPermission();
}

/**
 * Despia native OneSignal permission prompt (iOS). Runs at most once per device.
 * @deprecated Prefer `registerPushForAthlete`, which re-attempts until subscribed.
 */
export async function requestDespiaOneSignalPermissionOnce(): Promise<void> {
  if (!isNativeDespia() || !isDespiaIphoneUa()) return;
  if (localStorage.getItem(PUSH_PERMISSION_PROMPT_KEY) === '1') return;
  await requestNativePushPermission();
}
