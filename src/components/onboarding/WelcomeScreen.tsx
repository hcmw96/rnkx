import { useCallback, useEffect, useState, type ReactNode } from 'react';
import RNKXLogo from '@/components/RNKXLogo';
import { Button } from '@/components/ui/button';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import { WelcomeLeaderboardPreview } from '@/components/onboarding/WelcomeLeaderboardPreview';
import { WelcomePrivateGroupPreview } from '@/components/onboarding/WelcomePrivateGroupPreview';
import { WelcomeWearablesPreview } from '@/components/onboarding/WelcomeWearablesPreview';
import { WELCOME_ENGINE_LEADERBOARD_ROWS, WELCOME_LEADERBOARD_CLIMB_ROWS } from '@/data/mockAthletes';
import { cn } from '@/lib/utils';

const ONBOARDING_BG = '/assets/onboarding-bg.jpg';

const SLIDES: readonly { headline: string; preview: ReactNode }[] = [
  {
    headline: 'Your training has a ranking.',
    preview: (
      <WelcomeLeaderboardPreview league="engine" rows={WELCOME_ENGINE_LEADERBOARD_ROWS} />
    ),
  },
  {
    headline: 'Climb the board with every session.',
    preview: (
      <WelcomeLeaderboardPreview league="run" rows={WELCOME_LEADERBOARD_CLIMB_ROWS} />
    ),
  },
  {
    headline: 'WHOOP, Apple Health, and more — synced automatically.',
    preview: <WelcomeWearablesPreview />,
  },
  {
    headline: 'Compete with people who actually push you.',
    preview: <WelcomePrivateGroupPreview />,
  },
];

const AUTOPLAY_MS = 4500;

type WelcomeScreenProps = {
  onGetStarted: () => void;
  onLogIn: () => void;
};

export function WelcomeScreen({ onGetStarted, onLogIn }: WelcomeScreenProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!api) return;

    const onSelect = () => setActiveIndex(api.selectedScrollSnap());
    onSelect();
    api.on('select', onSelect);
    api.on('reInit', onSelect);
    return () => {
      api.off('select', onSelect);
      api.off('reInit', onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!api || reducedMotion) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const play = () => {
      timer = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        api.scrollNext();
      }, AUTOPLAY_MS);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };

    const onPointerDown = () => stop();
    const onPointerUp = () => {
      stop();
      play();
    };

    play();
    api.on('pointerDown', onPointerDown);
    api.on('pointerUp', onPointerUp);

    return () => {
      stop();
      api.off('pointerDown', onPointerDown);
      api.off('pointerUp', onPointerUp);
    };
  }, [api, reducedMotion]);

  const scrollTo = useCallback(
    (index: number) => {
      api?.scrollTo(index);
    },
    [api],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-foreground">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <img
          src={ONBOARDING_BG}
          alt=""
          className="h-full w-full object-cover object-[center_22%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
        <div className="absolute inset-0 bg-black/15" />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] sm:px-6">
        <div className="flex shrink-0 justify-center py-2">
          <RNKXLogo size="md" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-2">
          <Carousel
            setApi={setApi}
            opts={{
              align: 'start',
              loop: true,
              duration: reducedMotion ? 0 : 24,
            }}
            className="w-full"
            aria-label="Welcome highlights"
          >
            <CarouselContent className="-ml-0">
              {SLIDES.map((slide, index) => (
                <CarouselItem key={slide.headline} className="basis-full pl-0">
                  <div className="flex flex-col items-center gap-4 px-1">
                    <div className="w-full">{slide.preview}</div>
                    <h1
                      className="max-w-sm text-center font-sans text-[clamp(1.375rem,4.5vw,1.75rem)] font-bold leading-snug text-white"
                      aria-live={activeIndex === index ? 'polite' : 'off'}
                    >
                      {slide.headline}
                    </h1>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <div
            className="mt-4 flex items-center justify-center gap-2"
            role="tablist"
            aria-label="Welcome slides"
          >
            {SLIDES.map((slide, index) => (
              <button
                key={slide.headline}
                type="button"
                role="tab"
                aria-selected={activeIndex === index}
                aria-label={`Slide ${index + 1}: ${slide.headline}`}
                onClick={() => scrollTo(index)}
                className={cn(
                  'h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-lime focus-visible:ring-offset-2 focus-visible:ring-offset-black',
                  activeIndex === index ? 'w-6 bg-neon-lime' : 'w-2 bg-white/35 hover:bg-white/55',
                )}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-20 shrink-0 border-t border-white/10 bg-black/55 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <Button
            type="button"
            onClick={onGetStarted}
            className="h-12 w-full rounded-lg bg-neon-lime text-base font-semibold text-black shadow-[0_0_24px_hsl(72_100%_50%/0.35)] hover:bg-neon-lime/90 focus-visible:ring-neon-lime"
          >
            Get started
          </Button>
          <button
            type="button"
            onClick={onLogIn}
            className="rounded-md py-2 text-center text-sm font-semibold text-neon-lime underline-offset-4 transition-colors hover:text-neon-lime/85 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-lime focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
}
