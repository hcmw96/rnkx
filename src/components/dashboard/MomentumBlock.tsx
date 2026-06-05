import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MomentumBlockProps {
  weeklyChange: number;
  placesToPromotion?: number | null;
  placesToRelegation?: number | null;
  category: 'engine' | 'run';
  division?: string;
}

function thumbPosition(
  placesToPromotion: number | null | undefined,
  placesToRelegation: number | null | undefined,
  weeklyChange: number,
): number {
  if (
    placesToPromotion != null &&
    placesToRelegation != null &&
    placesToPromotion + placesToRelegation > 0
  ) {
    let pos = (placesToRelegation / (placesToPromotion + placesToRelegation)) * 100;
    if (weeklyChange > 0) pos = Math.min(82, pos + 10);
    if (weeklyChange < 0) pos = Math.max(18, pos - 10);
    return pos;
  }
  if (weeklyChange > 0) return 68;
  if (weeklyChange < 0) return 32;
  return 50;
}

function momentumStatus(weeklyChange: number): {
  label: string;
  Icon: typeof TrendingUp;
  className: string;
} {
  if (weeklyChange > 0) {
    return { label: 'Rising', Icon: TrendingUp, className: 'text-emerald-400' };
  }
  if (weeklyChange < 0) {
    return { label: 'Falling', Icon: TrendingDown, className: 'text-rose-400' };
  }
  return { label: 'Holding', Icon: Minus, className: 'text-muted-foreground' };
}

export function MomentumBlock({
  weeklyChange,
  placesToPromotion,
  placesToRelegation,
  category,
  division = 'Open',
}: MomentumBlockProps) {
  const isEngine = category === 'engine';
  const accentClass = isEngine ? 'text-neon-lime' : 'text-secondary';
  const borderClass = isEngine ? 'border-neon-lime/45' : 'border-secondary/45';
  const badgeBorderClass = isEngine ? 'border-neon-lime/50' : 'border-secondary/50';
  const thumbClass = isEngine
    ? 'bg-neon-lime shadow-[0_0_10px_hsl(var(--neon-lime)/0.85)]'
    : 'bg-secondary shadow-[0_0_10px_hsl(var(--secondary)/0.85)]';
  const gradientClass = isEngine
    ? 'bg-gradient-to-r from-rose-500/80 via-zinc-700/90 to-neon-lime/90'
    : 'bg-gradient-to-r from-rose-500/80 via-zinc-700/90 to-secondary/90';

  const status = momentumStatus(weeklyChange);
  const StatusIcon = status.Icon;
  const position = thumbPosition(placesToPromotion, placesToRelegation, weeklyChange);
  const divisionLabel = `${division} division`;

  return (
    <article className={cn('space-y-4 rounded-xl border bg-card p-4 shadow-sm', borderClass)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
            badgeBorderClass,
            accentClass,
          )}
        >
          {category}
        </span>
        <span className="min-w-0 flex-1 truncate text-center text-sm text-muted-foreground">
          {divisionLabel}
        </span>
        <span className={cn('flex shrink-0 items-center gap-1 text-xs font-medium', status.className)}>
          <StatusIcon className="h-3.5 w-3.5" aria-hidden />
          {status.label}
        </span>
      </div>

      <div className="relative px-0.5">
        <div className={cn('h-2.5 overflow-hidden rounded-full', gradientClass)} />
        <div className="pointer-events-none absolute inset-x-0.5 top-0 h-2.5" aria-hidden>
          <div className="absolute left-[33%] top-0 h-full w-px bg-background/40" />
          <div className="absolute left-[66%] top-0 h-full w-px bg-background/40" />
        </div>
        <div
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 rounded-full border-2 border-background',
            thumbClass,
          )}
          style={{ left: `${position}%`, transform: 'translate(-50%, -50%)' }}
          aria-hidden
        />
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="text-left">
          <p className="font-display text-3xl leading-none tracking-wide text-foreground">
            {placesToRelegation != null ? placesToRelegation : '—'}
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            From relegation
          </p>
        </div>
        <div className="text-right">
          <p className={cn('font-display text-3xl leading-none tracking-wide', accentClass)}>
            {placesToPromotion != null ? placesToPromotion : '—'}
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            From promotion
          </p>
        </div>
      </div>
    </article>
  );
}

type MomentumSectionProps = {
  engine: Omit<MomentumBlockProps, 'category'>;
  run: Omit<MomentumBlockProps, 'category'>;
};

export function MomentumSection({ engine, run }: MomentumSectionProps) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="type-section-label">Momentum</h2>
        <p className="text-xs text-muted-foreground">Where you sit between promotion and relegation</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <MomentumBlock category="engine" {...engine} />
        <MomentumBlock category="run" {...run} />
      </div>
    </div>
  );
}
