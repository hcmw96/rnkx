import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePremium } from '@/services/revenuecat';

const DEFAULT_TITLE = 'Premium feature';
const DEFAULT_DESCRIPTION = 'Upgrade to RNKX Premium to unlock';

type PremiumGateProps = {
  athleteId: string | undefined;
  children: ReactNode;
  previewContent?: ReactNode;
  title?: string;
  description?: string;
  badge?: string;
};

export function PremiumGate({
  athleteId,
  children,
  previewContent,
  title,
  description,
  badge,
}: PremiumGateProps) {
  const { isPremium, loading, presentPaywall } = usePremium(athleteId);

  if (loading) {
    return <div />;
  }

  if (!loading && !isPremium) {
    const heading = title ?? DEFAULT_TITLE;
    const body = description ?? DEFAULT_DESCRIPTION;

    return (
      <div className={cn('relative overflow-hidden rounded-xl border border-border')}>
        <div
          className="pointer-events-none select-none opacity-70 blur-[6px]"
          aria-hidden
        >
          {previewContent ?? <div className="min-h-[200px] bg-muted/25" />}
        </div>

        <div className="absolute inset-0 z-10 flex flex-col bg-black/55">
          {badge ? (
            <span
              className="absolute right-3 top-3 z-20 rounded-md bg-neon-lime px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-wide text-black shadow-sm ring-1 ring-neon-lime/50"
              aria-hidden
            >
              {badge}
            </span>
          ) : null}

          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <Lock className="h-8 w-8 shrink-0 text-neon-lime" strokeWidth={2} aria-hidden />
            <h3 className="text-xl font-bold text-white">{heading}</h3>
            <p className="max-w-sm text-sm text-zinc-400">{body}</p>
            <Button
              type="button"
              className="font-semibold bg-neon-lime text-black hover:bg-neon-lime/90"
              onClick={presentPaywall}
            >
              Upgrade to Premium
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
