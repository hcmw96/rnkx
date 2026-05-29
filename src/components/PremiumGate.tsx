import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePremium } from '@/services/revenuecat';

const DEFAULT_TITLE = 'Premium feature';
const DEFAULT_DESCRIPTION = 'Upgrade to RNKX Premium to unlock';

type PremiumGateProps = {
  athleteId: string | undefined;
  /** Supabase auth user id — used as RevenueCat `external_id` when opening the paywall. */
  userId: string | undefined;
  children: ReactNode;
  previewContent?: ReactNode;
  title?: string;
  description?: string;
  badge?: string;
};

export function PremiumGate({
  athleteId,
  userId,
  children,
  previewContent,
  title,
  description,
  badge,
}: PremiumGateProps) {
  const { isPremium, loading, presentPaywall } = usePremium(athleteId, userId);

  if (loading) {
    return <div />;
  }

  if (!loading && !isPremium) {
    const heading = title ?? DEFAULT_TITLE;
    const body = description ?? DEFAULT_DESCRIPTION;

    return (
      <div
        className={cn(
          'relative min-h-[min(22rem,52vh)] overflow-hidden rounded-xl border border-border bg-zinc-950',
        )}
      >
        <div className="pointer-events-none select-none opacity-55 blur-[5px]" aria-hidden>
          {previewContent ?? children ?? <div className="min-h-[22rem] bg-muted/15" />}
        </div>

        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/80 p-6 sm:p-8">
          {badge ? (
            <span
              className="absolute right-3 top-3 z-20 rounded-md bg-neon-lime px-2.5 py-1 font-sans text-xs font-bold uppercase tracking-wide text-black shadow-sm ring-1 ring-neon-lime/50"
              aria-hidden
            >
              {badge}
            </span>
          ) : null}

          <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-neon-lime/35 bg-neon-lime/10">
              <Lock className="h-7 w-7 text-neon-lime" strokeWidth={2} aria-hidden />
            </div>
            <div className="space-y-2">
              <h3 className="type-heading">{heading}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
            <Button
              type="button"
              size="lg"
              className="w-full font-semibold bg-neon-lime text-black hover:bg-neon-lime/90"
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
