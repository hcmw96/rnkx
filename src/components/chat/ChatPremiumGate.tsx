import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { supabase } from '@/services/supabase';
import { usePremium } from '@/services/revenuecat';

type ChatPremiumGateProps = {
  children: ReactNode;
};

/** Messaging is a Premium feature — consistent with Friends & Leagues. */
export function ChatPremiumGate({ children }: ChatPremiumGateProps) {
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  const [athleteId, setAthleteId] = useState<string | undefined>();

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      setAuthUserId(uid);
      if (uid) {
        setAthleteId(await resolveAthleteId(uid));
      }
    })();
  }, []);

  const { isPremium, loading, presentPaywall } = usePremium(athleteId, authUserId);

  if (loading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <Lock className="h-10 w-10 text-neon-lime" aria-hidden />
        <h1 className="font-display text-xl text-foreground">Premium messaging</h1>
        <p className="text-sm text-muted-foreground">
          Direct and group chat are included with RNKX Premium alongside friends and clubs.
        </p>
        <Button
          type="button"
          className="bg-neon-lime font-semibold text-black hover:bg-neon-lime/90"
          onClick={presentPaywall}
        >
          Upgrade to Premium
        </Button>
        <Button type="button" variant="outline" className="border-border" asChild>
          <Link to="/app/profile">View plans on Profile</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
