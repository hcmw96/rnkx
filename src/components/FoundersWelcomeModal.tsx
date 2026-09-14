import { useCallback, useRef, type ComponentType } from 'react';
import { Sparkles, Unlock } from 'lucide-react';

import RNKXLogo from '@/components/RNKXLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';

type FoundersWelcomeModalProps = {
  athleteId: string;
  onDismiss?: () => void;
};

const POINTS: readonly {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}[] = [
  {
    icon: Sparkles,
    title: 'Founders Club',
    description: 'You are in the Founders Club for Season 1.',
  },
  {
    icon: Unlock,
    title: 'Everything unlocked',
    description: 'Friends, clubs, chat, and insights — no payment needed.',
  },
];

const WRITE_RETRY_MS = 2_000;

export function FoundersWelcomeModal({ athleteId, onDismiss }: FoundersWelcomeModalProps) {
  const dismissedRef = useRef(false);

  const persistSeen = useCallback(async (id: string) => {
    const write = () =>
      supabase.from('athletes').update({ has_seen_founders_welcome: true }).eq('id', id);

    const first = await write();
    if (!first.error) return;
    await new Promise((r) => setTimeout(r, WRITE_RETRY_MS));
    const second = await write();
    if (second.error) {
      console.warn('[FoundersWelcomeModal] failed to persist has_seen_founders_welcome', second.error.message);
    }
  }, []);

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss?.();
    if (athleteId) {
      void persistSeen(athleteId);
    }
  }, [athleteId, onDismiss, persistSeen]);

  return (
    <div
      className="fixed inset-0 z-[100] flex max-h-[100svh] flex-col overflow-hidden bg-black text-foreground animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="founders-welcome-title"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="my-auto px-5 pb-3 pt-[calc(3.5rem+env(safe-area-inset-top,0px))] sm:px-6">
          <header className="flex shrink-0 flex-col items-center text-center">
            <RNKXLogo size="md" />
            <p id="founders-welcome-title" className="mt-4 font-sans text-base font-semibold text-white">
              Welcome to the Founders Club
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Season 1 is unlocked for you</p>
            <p className="mt-2 text-sm font-medium text-neon-lime">No payment needed.</p>
          </header>

          <ul className="mt-5 space-y-2.5">
            {POINTS.map(({ icon: Icon, title, description }) => (
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
        </div>

        <footer className="shrink-0 border-t border-white/10 bg-black px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full rounded-lg bg-neon-lime font-sans text-base font-semibold text-black hover:bg-neon-lime/90"
            onClick={dismiss}
          >
            Got it
          </Button>
        </footer>
      </div>
    </div>
  );
}
