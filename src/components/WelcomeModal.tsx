import { useCallback, useRef, useState, type ComponentType } from 'react';
import { ArrowUpDown, CalendarCheck, Trophy, Zap } from 'lucide-react';

import RNKXLogo from '@/components/RNKXLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';

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
    description: 'Your workouts are automatically converted into points.',
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

export function WelcomeModal({ athleteId, onDismiss }: WelcomeModalProps) {
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);

  const dismiss = useCallback(async () => {
    if (!athleteId || inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const { error } = await supabase.from('athletes').update({ has_seen_welcome: true }).eq('id', athleteId);
      if (error) {
        toast.error(error.message);
        return;
      }
      onDismiss?.();
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [athleteId, onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[100] flex h-[100dvh] flex-col overflow-hidden bg-black text-foreground animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
    >
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] sm:px-6">
        <header className="flex shrink-0 flex-col items-center text-center">
          <RNKXLogo size="md" />
          <p id="welcome-modal-title" className="mt-4 font-sans text-base font-semibold text-white">
            Welcome to RNKX
          </p>
          <p className="mt-1 text-sm text-muted-foreground">The Digital Performance Sport</p>
          <p className="mt-2 text-sm font-medium text-neon-lime">Train. Compete. Rank.</p>
        </header>

        <ul className="mt-6 flex min-h-0 flex-1 flex-col justify-center gap-2.5">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-card/80 px-3.5 py-3"
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neon-lime/20 bg-neon-lime/10',
                )}
                aria-hidden
              >
                <Icon className="h-4 w-4 text-neon-lime" />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 shrink-0 space-y-1.5 text-center">
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
          disabled={busy}
          className="h-12 w-full rounded-lg bg-neon-lime font-sans text-base font-semibold text-black hover:bg-neon-lime/90"
          onClick={() => void dismiss()}
        >
          Got it, let&apos;s go
        </Button>
      </footer>
    </div>
  );
}
