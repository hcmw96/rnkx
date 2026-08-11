import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import RNKXLogo from '@/components/RNKXLogo';
import { Button } from '@/components/ui/button';
import { WelcomeRankStack } from '@/components/onboarding/WelcomeRankStack';
import { isDespiaIOS, loadAppleAuthSdk } from '@/lib/appleSignIn';

type WelcomeScreenProps = {
  onGetStarted: () => void;
  onLogIn: () => void;
};

/**
 * Opening auth screen — brand, headline, rank preview, CTAs.
 * Viewport: `fixed inset-0` + `max-h-[100svh]` (no `100dvh`). Scrolls if needed
 * so CTAs stay reachable on short screens.
 */
export function WelcomeScreen({ onGetStarted, onLogIn }: WelcomeScreenProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isDespiaIOS()) return;
    void loadAppleAuthSdk().catch(() => {
      // Preload on welcome — tap will surface errors if this fails.
    });
  }, []);

  const fadeUp = (delay: number) =>
    reduceMotion
      ? { initial: false as const, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div className="fixed inset-0 z-50 flex max-h-[100svh] flex-col overflow-hidden bg-black text-foreground">
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-[calc(1.5rem+env(safe-area-inset-top,0px))] pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:px-8">
          <div className="mx-auto flex w-full max-w-[360px] flex-col items-center">
            <motion.div className="flex shrink-0 flex-col items-center" {...fadeUp(0.05)}>
              <RNKXLogo size="lg" className="h-12 w-auto sm:h-14" />
              <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-neon-lime sm:text-[0.7rem]">
                The digital performance sport
              </p>
            </motion.div>

            <motion.h1
              className="mt-8 w-full shrink-0 text-center font-sans text-[clamp(1.75rem,7.5vw,2.35rem)] font-extrabold uppercase leading-[1.05] tracking-tight"
              {...fadeUp(0.1)}
            >
              <span className="block text-white">Turn your</span>
              <span className="block text-white">training into</span>
              <span className="block text-neon-lime">competition</span>
            </motion.h1>

            <motion.div className="mt-7 w-full shrink-0" {...fadeUp(0.18)}>
              <WelcomeRankStack />
            </motion.div>

            <motion.div className="mt-8 flex w-full shrink-0 flex-col gap-1" {...fadeUp(0.26)}>
              <Button
                type="button"
                onClick={onGetStarted}
                className="h-12 w-full rounded-xl bg-neon-lime text-base font-bold text-zinc-950 hover:bg-neon-lime/90 focus-visible:ring-neon-lime sm:h-14"
              >
                Get started
              </Button>
              <button
                type="button"
                onClick={onLogIn}
                className="rounded-md py-2.5 text-center text-base font-semibold text-white transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-lime focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Log in
              </button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
