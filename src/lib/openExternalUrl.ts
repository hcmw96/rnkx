import despia from 'despia-native';

function isDespiaRuntime(): boolean {
  return navigator.userAgent.toLowerCase().includes('despia');
}

/**
 * Open an https URL outside the SPA router.
 * Despia intercepts `_blank` and also supports `applinks://open` for external content.
 */
export function openExternalUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (isDespiaRuntime()) {
    void despia(`applinks://open?url=${encodeURIComponent(trimmed)}`);
    return;
  }

  window.open(trimmed, '_blank', 'noopener,noreferrer');
}
