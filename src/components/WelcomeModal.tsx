import { useCallback, useRef, type ComponentType } from 'react';
import { ArrowUpDown, CalendarCheck, Trophy, X, Zap } from 'lucide-react';

import RNKXLogo from '@/components/RNKXLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';

type WelcomeModalProps = {
  athleteId: string;
  onDismiss?: () => void;
};

const FEATURES: readonly {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}[] = [
  {
    icon: Zap,
    title: 'Earn Points',
    description: 'Your workouts are converted into points.',
  },
  {
    icon: Trophy,
    title: 'Climb Leaderboards',
    description: 'Compete globally, with friends and inside clubs.',
  },
  {
    icon: ArrowUpDown,
    title: 'Promotion & Relegation',
    description: 'Rise through the divisions every season.',
  },
  {
    icon: CalendarCheck,
    title: 'Weekly Bonus',
    description: 'Train consistently to earn bonus points.',
  },
];

const WELCOME_WRITE_RETRY_MS = 2_000;

/**
 * Full-screen welcome overlay.
 * Sized with `fixed inset-0` + `max-h-[100svh]` (not `100dvh`):
 * - `inset-0` pins all four edges to the fixed containing block (visible WebView).
 * - `100svh` (small viewport height) is the most conservative CSS viewport unit —
 *   it never exceeds the fully-visible chrome case, unlike `dvh` which can briefly
 *   grow larger than what the user can see in iPhone-compat mode on iPad.
 */
export function WelcomeModal({ athleteId, onDismiss }: WelcomeModalProps) {
  const dismissedRef = useRef(false);

  const persistHasSeenWelcome = useCallback(async (id: string) => {
    const write = () =>
      supabase.from('athletes').update({ has_seen_welcome: true }).eq('id', id);

    const first = await write();
    if (!first.error) return;
    await new Promise((r) => setTimeout(r, WELCOME_WRITE_RETRY_MS));
    const second = await write();
    if (second.error) {
      console.warn('[WelcomeModal] failed to persist has_seen_welcome', second.error.message);
    }
  }, []);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    // Clear locally first — never trap behind this overlay on network failure.
    onDismiss?.();
    if (athleteId) {
      void persistHasSeenWelcome(athleteId);
    }
  }, [athleteId, onDismiss, persistHasSeenWelcome]);

  return (
    <div
      className="fixed inset-0 z-[100] flex max-h-[100svh] flex-col overflow-hidden bg-black text-foreground animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-[max(0.75rem,env(safe-area-inset-right,0px))] top-[max(0.75rem,env(safe-area-inset-top,0px))] z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-lime"
        aria-label="Close welcome"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="flex min-h-0 flex-1 flex-col px-5 pb-3 pt-[calc(2.75rem+env(safe-area-inset-top,0px))] sm:px-6">
          <header className="flex shrink-0 flex-col items-center text-center">
            <RNKXLogo size="md" />
            <p id="welcome-modal-title" className="mt-4 font-sans text-base font-semibold text-white">
              Welcome to RNKX
            </p>
            <p className="mt-1 text-sm text-muted-foreground">The Digital Performance Sport</p>
            <p className="mt-2 text-sm font-medium text-neon-lime">Train. Compete. Rank.</p>
          </header>

          <ul className="mt-5 space-y-2.5">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li
                key={title}
                className="flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-white/10 bg-card/80 px-3.5 py-2.5"
              >
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neon-lime/20 bg-neon-lime/10',
                  )}
                  aria-hidden
                >
                  <Icon className="h-4 w-4 text-neon-lime" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-3 shrink-0 space-y-1.5 text-center">
            <p className="text-sm font-semibold text-white">New Season. New Opportunity.</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Every 6–8 weeks the rankings reset and the race begins again.
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground/80">
              Full scoring guides and competition rules are available anytime in Settings.
            </p>
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/10 bg-black px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full rounded-lg bg-neon-lime font-sans text-base font-semibold text-black hover:bg-neon-lime/90"
            onClick={dismiss}
          >
            Got it, let&apos;s go
          </Button>
        </footer>
      </div>
    </div>
  );
}
