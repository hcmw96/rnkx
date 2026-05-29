import { Award, Lock } from 'lucide-react';
import type { AchievementColor, AchievementState } from '@/lib/achievements';
import { cn } from '@/lib/utils';

const COLOR_STYLES: Record<
  AchievementColor,
  { card: string; iconWrap: string; icon: string }
> = {
  gold: {
    card: 'border-amber-400/60 bg-amber-500/10',
    iconWrap: 'bg-amber-500/25',
    icon: 'text-amber-300',
  },
  lime: {
    card: 'border-neon-lime/45 bg-neon-lime/10',
    iconWrap: 'bg-neon-lime/20',
    icon: 'text-neon-lime',
  },
  cyan: {
    card: 'border-electric-cyan/45 bg-electric-cyan/10',
    iconWrap: 'bg-electric-cyan/20',
    icon: 'text-electric-cyan',
  },
  gradient: {
    card: 'border-transparent bg-gradient-to-br from-cyan-500/15 via-neon-lime/12 to-amber-400/15 ring-1 ring-white/10',
    iconWrap: 'bg-gradient-to-br from-cyan-500/30 via-neon-lime/25 to-amber-400/30',
    icon: 'text-foreground',
  },
};

export function AchievementBadge({ achievement }: { achievement: AchievementState }) {
  const styles = COLOR_STYLES[achievement.color];
  const locked = !achievement.unlocked;

  return (
    <div
      className={cn(
        'relative flex min-h-[7.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center',
        locked ? 'border-border bg-muted/15 opacity-55' : styles.card,
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          locked ? 'bg-muted text-muted-foreground' : styles.iconWrap,
        )}
      >
        <Award className={cn('h-5 w-5', locked ? '' : styles.icon)} aria-hidden />
      </div>
      <p className="text-xs font-semibold leading-tight text-foreground">{achievement.name}</p>
      <p className="text-[10px] leading-snug text-muted-foreground">{achievement.criteria}</p>
      {locked ? (
        <Lock className="absolute right-2 top-2 h-3 w-3 text-muted-foreground" aria-hidden />
      ) : null}
    </div>
  );
}
