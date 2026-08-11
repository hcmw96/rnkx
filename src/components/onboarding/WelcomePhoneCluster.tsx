import { cn } from '@/lib/utils';

/**
 * Real in-app captures — drop PNGs here (portrait phone screenshots):
 *   public/assets/welcome-dashboard.png
 *   public/assets/welcome-leaderboard.png
 *   public/assets/welcome-social.png
 * Do not substitute CSS mockups or design-file exports.
 */
const SHOTS = {
  dashboard: '/assets/welcome-dashboard.png',
  leaderboard: '/assets/welcome-leaderboard.png',
  social: '/assets/welcome-social.png',
} as const;

function PhoneFrame({
  src,
  className,
  depth = 'front',
}: {
  src: string;
  className?: string;
  depth?: 'back' | 'front';
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.35rem] border border-white/15 bg-zinc-950',
        depth === 'front'
          ? 'shadow-[0_16px_28px_-18px_rgba(0,0,0,0.75)]'
          : 'shadow-[0_10px_22px_-16px_rgba(0,0,0,0.65)]',
        className,
      )}
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-1.5">
        <span className="h-1 w-10 rounded-full bg-white/20" />
      </div>
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover object-top"
        draggable={false}
      />
    </div>
  );
}

/** Three overlapping real app screenshots — dashboard / leaderboard / social. */
export function WelcomePhoneCluster({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative mx-auto aspect-[5/4] w-full max-w-[380px]', className)}
      aria-hidden
    >
      {/* Left — Dashboard (behind, clipped) */}
      <PhoneFrame
        depth="back"
        src={SHOTS.dashboard}
        className="absolute left-[2%] top-[10%] z-[1] h-[88%] w-[42%] -rotate-[8deg] opacity-95"
      />

      {/* Right — Social / clubs (behind, clipped) */}
      <PhoneFrame
        depth="back"
        src={SHOTS.social}
        className="absolute right-[2%] top-[10%] z-[1] h-[88%] w-[42%] rotate-[8deg] opacity-95"
      />

      {/* Center — Leaderboard (raised, in front) */}
      <PhoneFrame
        depth="front"
        src={SHOTS.leaderboard}
        className="absolute left-1/2 top-0 z-[2] h-full w-[48%] -translate-x-1/2"
      />
    </div>
  );
}
