import despia from 'despia-native';
import { supabase } from '@/services/supabase';

const VERSION_TIMEOUT_MS = 5_000;
const inFlightAthletes = new Set<string>();
const promptedThisSession = new Set<string>();

function isDespiaRuntime(): boolean {
  return navigator.userAgent.toLowerCase().includes('despia');
}

function isOnboardingRoute(): boolean {
  return window.location.pathname.startsWith('/onboarding');
}

async function readNativeAppVersion(): Promise<string | null> {
  try {
    const result = await Promise.race([
      despia('getappversion://', ['versionNumber', 'bundleNumber']),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('despia timeout')), VERSION_TIMEOUT_MS);
      }),
    ]);
    const version =
      String(result?.versionNumber ?? '').trim() || String(result?.bundleNumber ?? '').trim();
    return version || null;
  } catch {
    return null;
  }
}

/**
 * Request the OS in-app rating sheet after a division-promotion overlay is gone.
 * No-ops in browsers, on error, during onboarding, and if this native version
 * was already prompted for this athlete.
 */
export async function requestInAppReviewAfterPromotion(athleteId: string): Promise<void> {
  const id = athleteId.trim();
  if (!id) return;
  if (!isDespiaRuntime()) return;
  if (isOnboardingRoute()) return;
  if (inFlightAthletes.has(id)) return;

  inFlightAthletes.add(id);
  try {
    const version = await readNativeAppVersion();
    if (!version) return;

    const sessionKey = `${id}::${version}`;
    if (promptedThisSession.has(sessionKey)) return;

    const { data, error } = await supabase
      .from('athletes')
      .select('in_app_review_prompted_version')
      .eq('id', id)
      .maybeSingle();
    if (error) return;

    const row = data as { in_app_review_prompted_version?: string | null } | null;
    const stored =
      typeof row?.in_app_review_prompted_version === 'string'
        ? row.in_app_review_prompted_version.trim()
        : '';
    if (stored === version) {
      promptedThisSession.add(sessionKey);
      return;
    }

    const { error: updateError } = await supabase
      .from('athletes')
      .update({ in_app_review_prompted_version: version })
      .eq('id', id);
    if (updateError) return;

    promptedThisSession.add(sessionKey);
    void despia('rateapp://');
  } catch {
    // Never surface review failures into product UI.
  } finally {
    inFlightAthletes.delete(id);
  }
}
