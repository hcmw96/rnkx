import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePremium } from '@/services/revenuecat';

type PremiumGateProps = {
  athleteId: string | undefined;
  children: ReactNode;
};

export function PremiumGate({ athleteId, children }: PremiumGateProps) {
  const { isPremium, loading, presentPaywall } = usePremium(athleteId);

  if (loading) {
    return null;
  }

  if (!isPremium) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/40">
            <Lock className="h-7 w-7 text-muted-foreground" aria-hidden />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">Premium feature</h3>
            <p className="max-w-sm text-sm text-muted-foreground">Upgrade to RNKX Premium to unlock</p>
          </div>
          <Button type="button" className="font-semibold" onClick={presentPaywall}>
            Upgrade Now
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
