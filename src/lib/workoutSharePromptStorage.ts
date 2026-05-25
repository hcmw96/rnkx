const PREFIX = 'rnkx_share_prompted_';

export function sharePromptDedupeKey(kind: 'workout' | 'activity', id: string): string {
  return `${kind}:${id}`;
}

export function wasSharePrompted(key: string): boolean {
  try {
    return sessionStorage.getItem(PREFIX + key) === '1';
  } catch {
    return false;
  }
}

export function markSharePrompted(key: string): void {
  try {
    sessionStorage.setItem(PREFIX + key, '1');
  } catch {
    /* ignore quota / private mode */
  }
}
