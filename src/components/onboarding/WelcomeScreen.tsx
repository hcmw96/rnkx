import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import RNKXLogo from '@/components/RNKXLogo';
import { Button } from '@/components/ui/button';
import { WelcomePhoneCluster } from '@/components/onboarding/WelcomePhoneCluster';
import { isDespiaIOS, loadAppleAuthSdk } from '@/lib/appleSignIn';

const ONBOARDING_BG = '/assets/onboarding-bg.png';

type WelcomeScreenProps = {
  onGetStarted: () => void;
  onLogIn: () => void;
};

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
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col overflow-hidden bg-black text-foreground">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <img
          src={ONBOARDING_BG}
          alt=""
          className="h-full w-full object-cover object-[center_35%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/55 to-black/90" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pt-[calc(0.85rem+env(safe-area-inset-top,0px))] sm:px-8">
        <motion.header className="shrink-0" {...fadeUp(0.05)}>
          <div className="flex justify-center">
            <RNKXLogo size="lg" className="h-14 w-auto sm:h-16" />
          </div>
        </motion.header>

        <motion.div className="mt-5 shrink-0 text-center sm:mt-6" {...fadeUp(0.12)}>
          <h1 className="font-sans text-[clamp(1.65rem,7vw,2.35rem)] font-extrabold uppercase leading-[1.05] tracking-tight text-white">
            Your training.
            <br />
            <span className="text-neon-lime">Ranked.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[20rem] text-balance text-[0.95rem] font-medium leading-snug text-white/85 sm:text-base">
            Turn every workout into global competition.
          </p>
        </motion.div>

        <motion.div
          className="relative my-4 flex min-h-0 flex-1 items-center justify-center sm:my-5"
          {...fadeUp(0.22)}
        >
          <WelcomePhoneCluster className="max-h-full w-full" />
        </motion.div>
      </div>

      <motion.footer
        className="relative z-20 shrink-0 px-5 pb-[calc(1.1rem+env(safe-area-inset-bottom,0px))] pt-2 sm:px-8"
        {...fadeUp(0.32)}
      >
        <div className="mx-auto flex w-full max-w-[360px] flex-col gap-3">
          <Button
            type="button"
            onClick={onGetStarted}
            className="h-14 w-full rounded-xl bg-neon-lime text-base font-bold text-black shadow-[0_0_28px_hsl(72_100%_50%/0.4)] hover:bg-neon-lime/90 focus-visible:ring-neon-lime"
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
        </div>
      </motion.footer>
    </div>
  );
}
