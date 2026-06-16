import { AppleLogo, GarminLogo, WhoopLogo } from '@/components/BrandLogos';
import { cn } from '@/lib/utils';

type WelcomeWearablesPreviewProps = {
  className?: string;
};

/** Wordmark PNGs (Garmin, WHOOP) are ~7:1 — need wide tiles, not square icon boxes. */
const DEVICES = [
  {
    Logo: AppleLogo,
    label: 'Apple Health',
    tileClass: 'px-2',
    logoClass: 'h-9 w-9',
  },
  {
    Logo: GarminLogo,
    label: 'Garmin',
    tileClass: 'px-2',
    logoClass: 'h-[1.125rem] w-full min-w-[4.25rem] sm:h-5',
  },
  {
    Logo: WhoopLogo,
    label: 'WHOOP',
    tileClass: 'px-2',
    logoClass: 'h-[1.125rem] w-full min-w-[3.75rem] sm:h-5',
  },
] as const;

export function WelcomeWearablesPreview({ className }: WelcomeWearablesPreviewProps) {
  return (
    <article
      className={cn(
        'mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-card/95 px-4 py-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md sm:px-5',
        className,
      )}
      aria-hidden
    >
      <p className="type-section-label text-center">Device sync</p>
      <div className="mt-5 grid grid-cols-3 gap-x-2">
        {DEVICES.map(({ Logo, label, tileClass, logoClass }) => (
          <div key={label} className="flex min-w-0 flex-col items-center gap-2">
            <div
              className={cn(
                'flex h-[3.25rem] w-full items-center justify-center rounded-xl border border-border/70 bg-muted/30',
                tileClass,
              )}
            >
              <Logo className={logoClass} />
            </div>
            <span className="text-center text-[11px] leading-tight text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
      <p className="type-body-muted mt-5 text-center text-sm">Workouts sync automatically in the background</p>
      <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center text-xs font-medium text-emerald-400">
        Last synced · 2 min ago
      </div>
    </article>
  );
}
