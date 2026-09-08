import { useLayoutEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Compass, Shield, UserRound } from 'lucide-react';
import { Link, Navigate, NavLink, useLocation } from 'react-router-dom';
import { PremiumGate } from '@/components/PremiumGate';
import { cn } from '@/lib/utils';
import FriendsPage from '@/pages/app/FriendsPage';
import PrivateLeaguesPage from '@/pages/app/PrivateLeaguesPage';
import DiscoverClubsPage from '@/pages/app/DiscoverClubsPage';

const TABS: readonly { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/app/social/friends', label: 'Friends', Icon: UserRound },
  { to: '/app/social/leagues', label: 'Clubs', Icon: Shield },
  { to: '/app/social/discover', label: 'Discover', Icon: Compass },
];

type SocialSub = '/app/social/friends' | '/app/social/leagues' | '/app/social/discover';

function subFromPath(pathname: string): SocialSub | null {
  if (pathname.startsWith('/app/social/leagues')) return '/app/social/leagues';
  if (pathname.startsWith('/app/social/discover')) return '/app/social/discover';
  if (pathname.startsWith('/app/social/friends') || pathname === '/app/social') {
    return '/app/social/friends';
  }
  return null;
}

export default function SocialPage() {
  const { pathname } = useLocation();
  const active = subFromPath(pathname);
  const [seen, setSeen] = useState<Set<SocialSub>>(() => new Set([active ?? '/app/social/friends']));

  useLayoutEffect(() => {
    const next = subFromPath(pathname) ?? '/app/social/friends';
    setSeen((s) => (s.has(next) ? s : new Set(s).add(next)));
  }, [pathname]);

  if (pathname === '/app/social') {
    return <Navigate to="/app/social/friends" replace />;
  }

  const show = active ?? '/app/social/friends';

  return (
    <PremiumGate
      title="Friends and Clubs"
      description="Unlock friends, messaging, public and private clubs with RNKX premium."
    >
      <div className="mx-auto max-w-lg space-y-4">
        <p className="text-center text-xs text-muted-foreground">
          Friends, clubs, and{' '}
          <Link to="/app/chat" className="font-medium text-neon-lime hover:underline">
            messages
          </Link>{' '}
          are included with Premium.
        </p>
        <nav className="grid grid-cols-3 border-b border-border" aria-label="Social sections">
          {TABS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-col items-center justify-center gap-1 border-b-2 py-3 text-xs font-medium transition-colors -mb-px',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground',
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        {seen.has('/app/social/friends') ? (
          <div
            hidden={show !== '/app/social/friends'}
            aria-hidden={show !== '/app/social/friends'}
            className={show === '/app/social/friends' ? undefined : 'hidden'}
          >
            <FriendsPage embedded />
          </div>
        ) : null}
        {seen.has('/app/social/leagues') ? (
          <div
            hidden={show !== '/app/social/leagues'}
            aria-hidden={show !== '/app/social/leagues'}
            className={show === '/app/social/leagues' ? undefined : 'hidden'}
          >
            <PrivateLeaguesPage embedded />
          </div>
        ) : null}
        {seen.has('/app/social/discover') ? (
          <div
            hidden={show !== '/app/social/discover'}
            aria-hidden={show !== '/app/social/discover'}
            className={show === '/app/social/discover' ? undefined : 'hidden'}
          >
            <DiscoverClubsPage />
          </div>
        ) : null}
      </div>
    </PremiumGate>
  );
}
