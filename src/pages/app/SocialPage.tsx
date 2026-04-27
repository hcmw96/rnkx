import { useCallback, useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Heart, Shield, UserRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { supabase } from '@/services/supabase';
import { cn } from '@/lib/utils';

const TABS: readonly { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/app/social/friends', label: 'Friends', Icon: UserRound },
  { to: '/app/social/leagues', label: 'Leagues', Icon: Shield },
  { to: '/app/social/recovery', label: 'Recovery', Icon: Heart },
];

export default function SocialPage() {
  const [athleteId, setAthleteId] = useState<string | undefined>();

  const loadAthlete = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setAthleteId(undefined);
      return;
    }
    const [byUserId, byId] = await Promise.all([
      supabase.from('athletes').select('id').eq('user_id', uid).not('username', 'is', null).maybeSingle(),
      supabase.from('athletes').select('id').eq('id', uid).not('username', 'is', null).maybeSingle(),
    ]);
    setAthleteId((byUserId.data?.id ?? byId.data?.id) as string | undefined);
  }, []);

  useEffect(() => {
    void loadAthlete();
  }, [loadAthlete]);

  return (
    <AppShell>
      <PremiumGate athleteId={athleteId}>
        <div className="mx-auto max-w-lg space-y-4">
          <nav
            className="grid grid-cols-3 border-b border-border"
            aria-label="Social sections"
          >
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
    </AppShell>
  );
}
