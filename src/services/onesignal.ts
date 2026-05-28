import despia from 'despia-native';

/**
 * Despia native push — https://setup.despia.com/native-features/onesignal
 * Link the device with setonesignalplayerid on every authenticated load.
 * Backend targets the same id via include_external_user_ids (athletes.id).
 */

export function isDespiaNative(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.userAgent.toLowerCase().includes('despia');
}

type NativePushPermissionResult = {
  nativePushEnabled?: boolean;
};

/** Whether iOS/Android has granted push permission for this app. */
export async function checkNativePushEnabled(): Promise<boolean | null> {
  if (!isDespiaNative()) return null;
  try {
    const result = await despia('checkNativePushPermissions://', ['nativePushEnabled']);
    return Boolean((result as NativePushPermissionResult)?.nativePushEnabled);
  } catch (err) {
    console.warn('[OneSignal] checkNativePushPermissions failed:', err);
    return false;
  }
}

/** Opens the app’s notification settings (use when permission was denied). */
export function openNotificationSettings(): void {
  if (!isDespiaNative()) return;
  void despia('settingsapp://');
}

/**
 * Links this device to athletes.id in OneSignal (external_id).
 * Call on every authenticated session per Despia docs.
 */
export async function registerPushForAthlete(athleteId: string): Promise<void> {
  if (!isDespiaNative()) return;

  const userId = athleteId.trim();
  if (!userId) return;

  await despia(`setonesignalplayerid://?user_id=${encodeURIComponent(userId)}`);

  let nativePushEnabled = await checkNativePushEnabled();

  if (nativePushEnabled === false) {
    try {
      await despia('registerpush://');
      nativePushEnabled = await checkNativePushEnabled();
    } catch (err) {
      console.warn('[OneSignal] registerpush failed:', err);
    }
  }

  console.log('[OneSignal] linked', { athleteId: userId, nativePushEnabled });
}

/** @deprecated Despia registers the native SDK at launch — no web init required. */
export async function initOneSignal(): Promise<void> {
  return;
}

export async function setOneSignalExternalId(athleteId: string): Promise<void> {
  await registerPushForAthlete(athleteId);
}

export async function isPushRegistered(): Promise<boolean> {
  const enabled = await checkNativePushEnabled();
  return enabled === true;
}

/** Request permission (custom flows / when auto-registration is off in Despia dashboard). */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isDespiaNative()) return false;
  try {
    await despia('registerpush://');
  } catch (err) {
    console.warn('[OneSignal] registerpush failed:', err);
  }
  return (await checkNativePushEnabled()) === true;
}

export async function requestDespiaOneSignalPermissionOnce(): Promise<void> {
  await requestNotificationPermission();
}
