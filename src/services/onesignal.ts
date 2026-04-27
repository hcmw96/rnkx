import OneSignal from 'react-onesignal';

const ONESIGNAL_APP_ID = '54875193-0dd4-48a1-89f6-d8d15db085c8';

let initPromise: Promise<void> | null = null;

export async function initOneSignal(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = OneSignal.init({
    appId: ONESIGNAL_APP_ID,
    allowLocalhostAsSecureOrigin: true,
  });
  return initPromise;
}

export async function setOneSignalExternalId(athleteId: string): Promise<void> {
  await OneSignal.login(athleteId);
}

export async function requestNotificationPermission(): Promise<boolean> {
  return OneSignal.Notifications.requestPermission();
}
