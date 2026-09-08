export type PrefetchTab = 'dashboard' | 'leaderboard' | 'social' | 'profile';

export const RNKX_PREFETCH_TAB = 'rnkx:prefetch-tab';

export function prefetchMainTab(tab: PrefetchTab): void {
  window.dispatchEvent(new CustomEvent(RNKX_PREFETCH_TAB, { detail: tab }));
}

export function tabFromNavPath(path: string): PrefetchTab | null {
  if (path === '/app') return 'dashboard';
  if (path === '/app/leaderboard') return 'leaderboard';
  if (path === '/app/social') return 'social';
  if (path === '/app/profile') return 'profile';
  return null;
}
