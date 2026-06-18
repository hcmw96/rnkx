import type { LucideIcon } from 'lucide-react';
import { Compass, Shield, UserRound } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { PremiumGate } from '@/components/PremiumGate';
import { useAthleteSession } from '@/context/AthleteSessionContext';
import { cn } from '@/lib/utils';

const TABS: readonly { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/app/social/friends', label: 'Friends', Icon: UserRound },
  { to: '/app/social/leagues', label: 'Clubs', Icon: Shield },
  { to: '/app/social/discover', label: 'Discover', Icon: Compass },
];

export default function SocialPage() {
  const { authUserId, athleteId } = useAthleteSession();

  return (
    <PremiumGate
      athleteId={athleteId}
      userId={authUserId}
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
        <Outlet />
      </div>
    </PremiumGate>
  );
}
