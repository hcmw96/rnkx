import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { supabase } from '@/services/supabase';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/app/social/friends', label: 'Friends' },
  { to: '/app/social/leagues', label: 'Leagues' },
  { to: '/app/social/recovery', label: 'Recovery' },
] as const;

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
          <nav className="flex gap-3 border-b border-border" aria-label="Social sections">
            {TABS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    '-mb-px border-b-2 pb-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-secondary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <Outlet />
        </div>
      </PremiumGate>
    </AppShell>
  );
}
