import OneSignal from 'react-onesignal';

let initPromise: Promise<void> | null = null;

export async function initOneSignal(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
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

export async function setOneSignalExternalId(athleteId: string): Promise<void> {
  await OneSignal.login(athleteId);
}

export async function requestNotificationPermission(): Promise<boolean> {
  return OneSignal.Notifications.requestPermission();
}
