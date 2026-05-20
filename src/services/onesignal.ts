import despia from 'despia-native';
import OneSignal from 'react-onesignal';
import { isDespiaIphoneUa } from '@/lib/despiaPlatform';

const PUSH_PERMISSION_PROMPT_KEY = 'rnkx_onesignal_permission_prompted';

let initPromise: Promise<void> | null = null;

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
  await OneSignal.login(athleteId);
}

export async function requestNotificationPermission(): Promise<boolean> {
  return OneSignal.Notifications.requestPermission();
}

/**
 * Despia native OneSignal permission prompt (iOS). Runs at most once per device.
 */
export async function requestDespiaOneSignalPermissionOnce(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!(window as Window & { despia?: unknown }).despia) return;
  if (!isDespiaIphoneUa()) return;
  if (localStorage.getItem(PUSH_PERMISSION_PROMPT_KEY) === '1') return;

  try {
    await despia('onesignal://requestPermission', ['oneSignalResponse']);
    localStorage.setItem(PUSH_PERMISSION_PROMPT_KEY, '1');
  } catch (err) {
    console.warn('[OneSignal] Despia permission request failed:', err);
  }
}
