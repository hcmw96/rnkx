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

type ClubListMetaProps = {
  gender: string | null | undefined;
  leagueType?: 'engine' | 'run' | string | null;
  memberCount: number;
  description?: string | null;
  className?: string;
};

/** One-line members + optional gender label (no chip) for compact club list rows. */
export function ClubListMeta({
  gender,
  leagueType = 'engine',
  memberCount,
  description,
  className,
}: ClubListMetaProps) {
  const genderLabel = clubGenderChipLabel(gender);
  const membersText =
    description ?? `${memberCount} member${memberCount !== 1 ? 's' : ''}`;
  const accentClass = leagueType === 'run' ? 'text-secondary' : 'text-primary';

  return (
    <p className={cn('type-meta mt-1 truncate', className)}>
      {membersText}
      {genderLabel ? (
        <>
          <span className="text-muted-foreground"> – </span>
          <span className={cn('font-medium', accentClass)}>{genderLabel}</span>
        </>
      ) : null}
    </p>
  );
}
