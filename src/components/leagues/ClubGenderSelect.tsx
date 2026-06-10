import type { ClubGender } from '@/lib/clubGender';
import { CLUB_GENDER_OPTIONS, clubGendersCreatableByAthlete } from '@/lib/clubGender';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

type ClubGenderSelectProps = {
  value: ClubGender;
  onChange: (value: ClubGender) => void;
  /** When set, Men/Women options are disabled unless they match the athlete profile. */
  athleteGender?: string | null;
};

export function ClubGenderSelect({ value, onChange, athleteGender }: ClubGenderSelectProps) {
  const allowed = new Set(clubGendersCreatableByAthlete(athleteGender));

  return (
    <div className="flex rounded-xl bg-muted/90 p-1">
      {CLUB_GENDER_OPTIONS.map((option) => {
        const disabled = !allowed.has(option.value);
        return (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            haptic('light');
            onChange(option.value);
          }}
          className={cn(
            'flex flex-1 items-center justify-center rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
            disabled && 'cursor-not-allowed opacity-40 hover:text-muted-foreground',
          )}
        >
          {option.label}
        </button>
      );
      })}
    </div>
  );
}
