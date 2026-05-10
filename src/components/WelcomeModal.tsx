import { useCallback } from 'react';
import { Trophy } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { HowItWorksScrollBody } from '@/components/HowItWorksContent';

export const RNKX_WELCOME_SEEN_KEY = 'rnkx_welcome_seen' as const;

type WelcomeModalProps = {
  username: string;
  onDismiss?: () => void;
};

export function WelcomeModal({ username, onDismiss }: WelcomeModalProps) {
  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(RNKX_WELCOME_SEEN_KEY, 'true');
    } catch {
      /* ignore quota / privacy mode */
    }
    onDismiss?.();
  }, [onDismiss]);

  const displayName = username.trim() || 'there';

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-zinc-950/95 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
    >
      <header className="shrink-0 bg-gradient-to-br from-emerald-800 via-green-950 to-zinc-950 px-6 pb-8 pt-[calc(2.5rem+env(safe-area-inset-top,0px))]">
        <div className="mx-auto flex max-w-lg flex-col items-center pt-6 text-center sm:pt-8">
          <div className="mb-5 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 py-2">
              <Trophy className="h-8 w-8 text-[#ADFF2F]" aria-hidden />
              <span
                id="welcome-modal-title"
                className="font-display text-lg tracking-wide text-white sm:text-xl"
              >
                Welcome to RNKX
              </span>
            </div>
            <p className="text-3xl font-bold leading-tight text-white sm:text-4xl">
              Hey {displayName}! 👋
            </p>
            <p className="max-w-md text-sm font-medium text-emerald-100/90">
              Here's how to climb the ranks
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <HowItWorksScrollBody />
      </div>

      <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-5">
        <div className="mx-auto max-w-lg">
          <Button
            type="button"
            size="lg"
            className="h-14 w-full rounded-xl bg-[#ADFF2F] font-display text-lg font-bold tracking-wide text-zinc-900 shadow-[0_0_28px_rgba(173,255,47,0.28)] hover:bg-[#9EF01A]"
            onClick={dismiss}
          >
            Got it, let's go! 🚀
          </Button>
        </div>
      </div>
    </div>
  );
}
