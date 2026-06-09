import { isDivision, type Division } from '@/lib/division';
import {
  isInPromotionZone,
  momentumPromotionTickPct,
  momentumThumbPosition,
} from '@/lib/momentumMetrics';
import { cn } from '@/lib/utils';

interface MomentumRowProps {
  placesToPromotion?: number | null;
  category: 'engine' | 'run';
  division?: string;
}

function MomentumRow({
  placesToPromotion,
  category,
  division = 'Open',
}: MomentumRowProps) {
  const resolvedDivision: Division = isDivision(division) ? division : 'Open';
  const isEngine = category === 'engine';
  const accentClass = isEngine ? 'text-neon-lime' : 'text-secondary';
  const badgeBorderClass = isEngine ? 'border-neon-lime/50' : 'border-secondary/50';
  const gradientClass = isEngine
    ? 'bg-gradient-to-r from-[hsla(0,0%,4%,1)] via-zinc-800/90 to-neon-lime/85'
    : 'bg-gradient-to-r from-[hsla(0,0%,4%,1)] via-zinc-800/90 to-secondary/85';

  const inPromotionZone = isInPromotionZone(resolvedDivision, placesToPromotion);
  const promotionPct = momentumPromotionTickPct();
  const position = momentumThumbPosition(resolvedDivision, placesToPromotion);
  const divisionLabel = `${resolvedDivision} division`;
  const leagueLabel = isEngine ? 'Engine' : 'Run';

  const thumbClass = cn(
    'absolute top-1/2 h-3 w-3 rounded-full border-2 border-background',
    isEngine ? 'bg-neon-lime' : 'bg-secondary',
    inPromotionZone
      ? isEngine
        ? 'shadow-[0_0_14px_hsl(var(--neon-lime)/1)]'
        : 'shadow-[0_0_14px_hsl(var(--secondary)/1)]'
      : isEngine
        ? 'shadow-[0_0_8px_hsl(var(--neon-lime)/0.75)]'
        : 'shadow-[0_0_8px_hsl(var(--secondary)/0.75)]',
  );

  const promotionTickClass = cn(
    'absolute top-0 h-1.5 w-px -translate-x-1/2',
    inPromotionZone
      ? isEngine
        ? 'bg-neon-lime shadow-[0_0_8px_hsl(var(--neon-lime)/0.95)]'
        : 'bg-secondary shadow-[0_0_8px_hsl(var(--secondary)/0.95)]'
      : 'bg-muted-foreground/45',
  );

  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-foreground">{divisionLabel}</p>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            badgeBorderClass,
            accentClass,
          )}
        >
          {leagueLabel}
        </span>
      </div>

      <div className="space-y-0.5">
        <div className="relative">
          <div className={cn('h-1.5 overflow-hidden rounded-full', gradientClass)} />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5" aria-hidden>
            <div
              className={cn(
                'absolute top-0 h-full w-px -translate-x-1/2',
                inPromotionZone
                  ? isEngine
                    ? 'bg-neon-lime/70 shadow-[0_0_6px_hsl(var(--neon-lime)/0.8)]'
                    : 'bg-secondary/70 shadow-[0_0_6px_hsl(var(--secondary)/0.8)]'
                  : 'bg-background/35',
              )}
              style={{ left: `${promotionPct}%` }}
            />
          </div>
          <div
            className={thumbClass}
            style={{ left: `${position}%`, transform: 'translate(-50%, -50%)' }}
            aria-hidden
          />
        </div>

        <div className="relative h-1.5" aria-hidden>
          <div className={promotionTickClass} style={{ left: `${promotionPct}%` }} />
        </div>
      </div>

      <div
        className={cn(
          'flex items-end gap-3',
          resolvedDivision === 'Open' ? 'justify-between' : 'justify-end',
        )}
      >
        {resolvedDivision === 'Open' ? (
          <p className="text-[10px] font-medium uppercase tracking-wider text-foreground">
            No relegation
          </p>
        ) : null}
        <div className="shrink-0 text-right">
          <p className="type-stat text-foreground">
            {placesToPromotion != null ? placesToPromotion : '—'}
          </p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground">
            From promotion
          </p>
        </div>
      </div>
    </div>
  );
}

type MomentumSectionProps = {
  engine: Omit<MomentumRowProps, 'category'>;
  run: Omit<MomentumRowProps, 'category'>;
};

export function MomentumSection({ engine, run }: MomentumSectionProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      <div className="px-3 pb-2 pt-3">
        <h2 className="type-section-label text-foreground">Momentum</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Where you sit between promotion and relegation</p>
      </div>

      <div className="border-t border-border/50" role="separator" />
      <MomentumRow category="engine" {...engine} />
      <div className="border-t border-border/50" role="separator" />
      <MomentumRow category="run" {...run} />
    </div>
  );
}
