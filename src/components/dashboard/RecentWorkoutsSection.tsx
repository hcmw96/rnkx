import { useMemo, useState } from 'react';
import { ChevronDown, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatScore } from '@/lib/formatScore';
import { cn } from '@/lib/utils';

const PREVIEW_COUNT = 4;

export type RecentWorkoutItem = {
  id: string;
  label: string;
  dateLabel: string;
  leagueType: 'engine' | 'run';
  score: number;
  /** When set, show share control that reopens the social card for this workout. */
  shareRef?: { kind: 'workout' | 'activity'; id: string };
};

type RecentWorkoutsSectionProps = {
  items: RecentWorkoutItem[];
  onShareWorkout?: (ref: { kind: 'workout' | 'activity'; id: string }) => void | Promise<void>;
  sharingId?: string | null;
};

const LEAGUE_SCORE_CLASS = {
  engine: 'text-primary',
  run: 'text-secondary',
} as const;

const LEAGUE_BADGE_CLASS = {
  engine: 'bg-orange-500/15 text-orange-300',
  run: 'bg-cyan-500/15 text-cyan-300',
} as const;

export function RecentWorkoutsSection({
  items,
  onShareWorkout,
  sharingId,
}: RecentWorkoutsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleItems = useMemo(() => {
    if (expanded || items.length <= PREVIEW_COUNT) return items;
    return items.slice(0, PREVIEW_COUNT);
  }, [expanded, items]);

  const hiddenCount = items.length - PREVIEW_COUNT;
  const showToggle = items.length > PREVIEW_COUNT;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="type-section-label">Recent workouts</h3>

      {!items.length ? (
        <p className="mt-3 type-body-muted">No scored workouts yet.</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-1.5">
            {visibleItems.map((item) => {
              const busy = sharingId != null && item.shareRef?.id === sharingId;
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg border border-border/70 bg-[hsla(0,0%,10%,1)] px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="type-heading truncate">{item.label}</p>
                    <p className="type-meta mt-0.5 truncate">{item.dateLabel}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        LEAGUE_BADGE_CLASS[item.leagueType],
                      )}
                    >
                      {item.leagueType === 'run' ? 'Run' : 'Engine'}
                    </span>
                    <p
                      className={cn(
                        'shrink-0 whitespace-nowrap text-right tabular-nums leading-tight',
                        LEAGUE_SCORE_CLASS[item.leagueType],
                      )}
                    >
                      <span className="text-lg font-bold">{formatScore(item.score)}</span>
                      <span className="ml-1 text-xs font-medium text-muted-foreground">pts</span>
                    </p>
                    {item.shareRef && onShareWorkout ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-neon-lime"
                        disabled={busy}
                        aria-label={`Share ${item.label}`}
                        onClick={() => void onShareWorkout(item.shareRef!)}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Share2 className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {showToggle ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 w-full text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? 'Show less' : `View all (${hiddenCount} more)`}
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
                aria-hidden
              />
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
