import type { AthleteProfileGender } from '@/lib/clubGender';
import { ATHLETE_GENDER_OPTIONS } from '@/lib/clubGender';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

type ProfileGenderSelectProps = {
  value: AthleteProfileGender | null;
  onChange: (value: AthleteProfileGender) => void;
};

export function ProfileGenderSelect({ value, onChange }: ProfileGenderSelectProps) {
  return (
    <div className="flex flex-col gap-2">
      {ATHLETE_GENDER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            haptic('light');
            onChange(option.value);
          }}
          className={cn(
            'rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors',
            value === option.value
              ? 'border-neon-lime/50 bg-neon-lime/10 text-foreground'
              : 'border-border bg-muted/20 text-muted-foreground hover:border-border/80 hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
