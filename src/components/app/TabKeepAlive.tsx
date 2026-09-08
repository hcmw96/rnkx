import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RNKX_PREFETCH_TAB, type PrefetchTab } from '@/lib/tabPrefetch';
import Dashboard from '@/pages/app/Dashboard';
import LeaderboardPage from '@/pages/app/LeaderboardPage';
import SocialPage from '@/pages/app/SocialPage';
import ProfilePage from '@/pages/app/ProfilePage';

type MainTab = 'dashboard' | 'leaderboard' | 'social' | 'profile';

const ALL_TABS: MainTab[] = ['dashboard', 'leaderboard', 'social', 'profile'];

function tabFromPath(pathname: string): MainTab | null {
  if (pathname === '/app') return 'dashboard';
  if (pathname === '/app/leaderboard') return 'leaderboard';
  if (pathname.startsWith('/app/social')) return 'social';
  if (pathname === '/app/profile') return 'profile';
  return null;
}

function KeepPanel({ show, children }: { show: boolean; children: ReactNode }) {
  useLayoutEffect(() => {
    if (!show) return;
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    const later = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(later);
    };
  }, [show]);

  return (
    <div hidden={!show} aria-hidden={!show} className={show ? 'flex min-h-full flex-col' : 'hidden'} {...(!show ? { inert: '' } : {})}>
      {children}
    </div>
  );
}

/**
 * Keeps the four bottom-nav pages mounted after first visit so tab switches
 * do not remount or refetch. Off-tab routes (settings, chat, …) still use Outlet.
 */
export function TabKeepAlive() {
  const { pathname } = useLocation();
  const tab = tabFromPath(pathname);
  const [seen, setSeen] = useState<Set<MainTab>>(() => new Set(tab ? [tab] : []));
  const prevTab = useRef<MainTab | null>(tab);
  const scrollByTab = useRef<Partial<Record<MainTab, number>>>({});

  useLayoutEffect(() => {
    if (!tab) return;
    setSeen((s) => (s.has(tab) ? s : new Set(s).add(tab)));
  }, [tab]);

  useLayoutEffect(() => {
    const main = document.querySelector('.app-content');
    if (!(main instanceof HTMLElement)) return;
    const prev = prevTab.current;
    if (prev) scrollByTab.current[prev] = main.scrollTop;
    if (tab) main.scrollTop = scrollByTab.current[tab] ?? 0;
    prevTab.current = tab;
  }, [tab]);

  useEffect(() => {
    const onPrefetch = (event: Event) => {
      const next = (event as CustomEvent<PrefetchTab>).detail;
      if (!next) return;
      setSeen((s) => (s.has(next) ? s : new Set(s).add(next)));
    };
    window.addEventListener(RNKX_PREFETCH_TAB, onPrefetch);
    return () => window.removeEventListener(RNKX_PREFETCH_TAB, onPrefetch);
  }, []);

  useEffect(() => {
    if (!tab) return;
    const rest = ALL_TABS.filter((t) => t !== tab);
    let cancelled = false;
    let gapId = 0;
    const startId = window.setTimeout(() => {
      const mountAt = (i: number) => {
        if (cancelled || i >= rest.length) return;
        setSeen((s) => (s.has(rest[i]) ? s : new Set(s).add(rest[i])));
        gapId = window.setTimeout(() => mountAt(i + 1), 900);
      };
      mountAt(0);
    }, 3500);
    return () => {
      cancelled = true;
      window.clearTimeout(startId);
      window.clearTimeout(gapId);
    };
  }, [tab]);

  return (
    <>
      {seen.has('dashboard') ? (
        <KeepPanel show={tab === 'dashboard'}>
          <Dashboard />
        </KeepPanel>
      ) : null}
      {seen.has('leaderboard') ? (
        <KeepPanel show={tab === 'leaderboard'}>
          <LeaderboardPage />
        </KeepPanel>
      ) : null}
      {seen.has('social') ? (
        <KeepPanel show={tab === 'social'}>
          <SocialPage />
        </KeepPanel>
      ) : null}
      {seen.has('profile') ? (
        <KeepPanel show={tab === 'profile'}>
          <ProfilePage />
        </KeepPanel>
      ) : null}
      {tab == null ? <Outlet /> : null}
    </>
  );
}
