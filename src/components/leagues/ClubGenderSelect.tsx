import type { ClubGender } from '@/lib/clubGender';
import { CLUB_GENDER_OPTIONS } from '@/lib/clubGender';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

type ClubGenderSelectProps = {
  value: ClubGender;
  onChange: (value: ClubGender) => void;
};

export function ClubGenderSelect({ value, onChange }: ClubGenderSelectProps) {
  return (
    <div className="flex rounded-xl bg-muted/90 p-1">
      {CLUB_GENDER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            haptic('light');
            onChange(option.value);
          }}
          className={cn(
            'flex flex-1 items-center justify-center rounded-lg px-2 py-2.5 text-sm font-semibold transition-colors',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
