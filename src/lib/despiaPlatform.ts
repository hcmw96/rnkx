/** Despia iOS WebView — matches Profile Apple Watch / HealthKit flows. */
export function isDespiaIphoneUa(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('despia') && ua.includes('iphone');
}

/** Athlete has Apple Watch selected in wearables (sync reminder targets Despia iOS Watch users). */
export function wearablesIncludeAppleWatch(wearables: string[] | null | undefined): boolean {
  return (wearables ?? []).some((w) => String(w).toLowerCase() === 'apple_watch');
}
