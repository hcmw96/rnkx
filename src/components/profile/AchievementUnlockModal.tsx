import { Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AchievementColor, AchievementState } from '@/lib/achievements';
import { cn } from '@/lib/utils';

const COLOR_STYLES: Record<AchievementColor, { ring: string; iconWrap: string; icon: string }> = {
  gold: {
    ring: 'ring-amber-400/50',
    iconWrap: 'bg-amber-500/30',
    icon: 'text-amber-300',
  },
  lime: {
    ring: 'ring-neon-lime/45',
    iconWrap: 'bg-neon-lime/25',
    icon: 'text-neon-lime',
  },
  cyan: {
    ring: 'ring-electric-cyan/45',
    iconWrap: 'bg-electric-cyan/25',
    icon: 'text-electric-cyan',
  },
  gradient: {
    ring: 'ring-white/15',
    iconWrap: 'bg-gradient-to-br from-cyan-500/35 via-neon-lime/30 to-amber-400/35',
    icon: 'text-foreground',
  },
};

type AchievementUnlockModalProps = {
  achievement: AchievementState;
  queueLength: number;
  onDismiss: () => void;
};

export function AchievementUnlockModal({
  achievement,
  queueLength,
  onDismiss,
}: AchievementUnlockModalProps) {
  const styles = COLOR_STYLES[achievement.color];

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-zinc-950/95 px-6 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="achievement-unlock-title"
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-sm flex-col items-center rounded-2xl border border-border bg-card p-8 text-center shadow-xl ring-2',
          styles.ring,
        )}
      >
        <p className="type-section-label text-neon-lime">Achievement unlocked</p>
        <div
          className={cn('mt-6 flex h-20 w-20 items-center justify-center rounded-full', styles.iconWrap)}
        >
          <Award className={cn('h-10 w-10', styles.icon)} aria-hidden />
        </div>
        <h2 id="achievement-unlock-title" className="mt-5 text-2xl font-bold text-foreground">
          {achievement.name}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{achievement.criteria}</p>
        {queueLength > 1 ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {queueLength - 1} more badge{queueLength > 2 ? 's' : ''} waiting
          </p>
        ) : null}
        <Button type="button" className="mt-8 w-full" size="lg" onClick={onDismiss}>
          {queueLength > 1 ? 'Next' : 'Nice!'}
        </Button>
      </div>
    </div>
  );
}
