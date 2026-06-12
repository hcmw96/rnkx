import { clubGenderChipLabel } from '@/lib/clubGender';
import { cn } from '@/lib/utils';

type ClubGenderChipProps = {
  gender: string | null | undefined;
  className?: string;
};

export function ClubGenderChip({ gender, className }: ClubGenderChipProps) {
  const label = clubGenderChipLabel(gender);
  if (!label) return null;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {label}
    </span>
  );
}
