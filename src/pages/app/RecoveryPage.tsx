import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';

type RecoveryPageProps = {
  embedded?: boolean;
};

export default function RecoveryPage({ embedded = false }: RecoveryPageProps) {
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

  const inner = (
    <section className="mx-auto max-w-lg space-y-3">
      {!embedded ? <h1 className="font-display text-xl text-foreground">Recovery</h1> : null}
      <p className="text-sm text-muted-foreground">
        Sleep and recovery insights from your wearables will appear here. Connect Whoop or other devices from your
        profile to get started.
      </p>
    </section>
  );

  if (embedded) return inner;

  return (
    <AppShell>
      <PremiumGate athleteId={athleteId}>{inner}</PremiumGate>
    </AppShell>
  );
}
