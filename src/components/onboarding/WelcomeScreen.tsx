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
 * Viewport: `fixed inset-0` + `max-h-[100svh]` (no `100dvh`). A non-scrolling
 * bottom spacer keeps Log in off the screen edge on every height.
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
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-[max(1.5rem,calc(env(safe-area-inset-top,0px)+0.75rem))] [-webkit-overflow-scrolling:touch]">
          <div className="my-auto flex w-full max-w-[360px] flex-col items-center gap-7 self-center py-1">
            <motion.div className="flex shrink-0 flex-col items-center gap-2" {...fadeUp(0.05)}>
              <RNKXLogo size="lg" className="-my-3 h-[4.75rem] w-auto" />
              <p className="text-[8px] font-medium uppercase leading-none tracking-[0.22em] text-neon-lime">
                The digital performance sport
              </p>
            </motion.div>

            <motion.h1
              className="w-full shrink-0 text-center font-headline text-[clamp(2.5rem,12vw,3.05rem)] font-black uppercase leading-[0.95] tracking-[-0.04em]"
              {...fadeUp(0.1)}
            >
              <span className="block text-white">Turn your</span>
              <span className="block text-white">training into</span>
              <span className="block text-neon-lime">competition</span>
            </motion.h1>

            <motion.div className="w-full shrink-0" {...fadeUp(0.18)}>
              <WelcomeRankStack />
            </motion.div>

            <motion.div className="flex w-full shrink-0 flex-col items-center gap-6" {...fadeUp(0.26)}>
              <Button
                type="button"
                onClick={onGetStarted}
                className="h-14 w-full rounded-2xl bg-neon-lime text-[1.05rem] font-bold text-black hover:bg-neon-lime/90 focus-visible:ring-neon-lime"
              >
                Get started
              </Button>
              <button
                type="button"
                onClick={onLogIn}
                className="rounded-md px-3 text-center text-[1.05rem] font-medium leading-none text-white transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-lime focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Log in
              </button>
            </motion.div>
          </div>
        </div>
        <div
          className="h-[max(3.25rem,calc(env(safe-area-inset-bottom,0px)+1.75rem))] shrink-0"
          aria-hidden
        />
      </div>
    </div>
  );
}
