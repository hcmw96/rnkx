import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePremium } from '@/services/revenuecat';

const DEFAULT_TITLE = 'Premium feature';
const DEFAULT_DESCRIPTION = 'Upgrade to RNKX Premium to unlock this feature.';

/** Fill scrollable main area below header + bottom nav (non-compact gates only). */
const FULL_PAGE_MIN_HEIGHT =
  'min-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-9.5rem)]';

type PremiumGateProps = {
  athleteId: string | undefined;
  /** Supabase auth user id — used as RevenueCat `external_id` when opening the paywall. */
  userId: string | undefined;
  children: ReactNode;
  /** Optional mock UI when the real children would be empty or minimal. */
  previewContent?: ReactNode;
  title?: string;
  description?: string;
  badge?: string;
  className?: string;
  /** Tighter overlay for inline gates (e.g. a single button). */
  compact?: boolean;
};

export function PremiumGate({
  athleteId,
  userId,
  children,
  previewContent,
  title,
  description,
  badge,
  className,
  compact,
}: PremiumGateProps) {
  const { isPremium, loading, presentPaywall } = usePremium(athleteId, userId);

  if (loading) {
    return (
      <div className={cn('relative', !compact && FULL_PAGE_MIN_HEIGHT, className)}>
        {children}
        <div
          className="pointer-events-none absolute inset-0 bg-background/40"
          aria-busy="true"
          aria-label="Checking premium access"
        />
      </div>
    );
  }

  if (isPremium) {
    return <>{children}</>;
  }

  const heading = title ?? DEFAULT_TITLE;
  const body = description ?? DEFAULT_DESCRIPTION;
  const preview = previewContent ?? children;

  return (
    <div className={cn('relative rounded-xl', !compact && FULL_PAGE_MIN_HEIGHT, className)}>
      <div
        className={cn(
          'pointer-events-none select-none opacity-50',
          !compact && FULL_PAGE_MIN_HEIGHT,
        )}
        aria-hidden
      >
        {preview ?? (
          <div className={cn('bg-muted/15', compact ? 'min-h-[5rem]' : FULL_PAGE_MIN_HEIGHT)} />
        )}
      </div>

      {badge ? (
        <span
          className="absolute right-3 top-3 z-20 rounded-md bg-neon-lime px-2.5 py-1 font-sans text-xs font-bold uppercase tracking-wide text-black shadow-sm ring-1 ring-neon-lime/50"
          aria-hidden
        >
          {badge}
        </span>
      ) : null}

      <div
        className={cn(
          'absolute inset-0 z-10 flex items-center justify-center bg-background/25',
          compact ? 'p-4' : 'p-6 sm:p-8',
        )}
      >
        <div
          className={cn(
            'pointer-events-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-border/80 bg-card/95 p-5 text-center shadow-lg backdrop-blur-[2px] sm:gap-5 sm:p-6',
            compact && 'max-w-xs gap-3 p-4 sm:p-5',
          )}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-neon-lime/35 bg-neon-lime/10 sm:h-14 sm:w-14">
            <Lock className="h-6 w-6 text-neon-lime sm:h-7 sm:w-7" strokeWidth={2} aria-hidden />
          </div>
          <div className="space-y-1.5">
            <h3 className={cn('type-heading', compact && 'text-sm')}>{heading}</h3>
            <p className={cn('text-sm leading-relaxed text-muted-foreground', compact && 'text-xs')}>
              {body}
            </p>
          </div>
          <Button
            type="button"
            size={compact ? 'default' : 'lg'}
            className="w-full font-semibold bg-neon-lime text-black hover:bg-neon-lime/90"
            onClick={presentPaywall}
          >
            Unlock Premium
          </Button>
        </div>
      </div>
    </div>
  );
}
