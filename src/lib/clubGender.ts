export type ClubGender = 'male' | 'female' | 'mixed';

export const CLUB_GENDER_OPTIONS: { value: ClubGender; label: string }[] = [
  { value: 'male', label: 'Men' },
  { value: 'female', label: 'Women' },
  { value: 'mixed', label: 'Mixed' },
];

export function normalizeClubGender(value: string | null | undefined): ClubGender {
  if (value === 'male' || value === 'female') return value;
  return 'mixed';
}

export function clubGenderLabel(value: string | null | undefined): string {
  return CLUB_GENDER_OPTIONS.find((o) => o.value === value)?.label ?? 'Mixed';
}

export function athleteCanJoinClub(
  clubGender: string | null | undefined,
  athleteGender: string | null | undefined,
): boolean {
  const club = normalizeClubGender(clubGender);
  if (club === 'mixed') return true;
  return athleteGender === club;
}

export function clubGenderJoinMessage(clubGender: ClubGender): string {
  if (clubGender === 'male') return 'This club is for men only.';
  if (clubGender === 'female') return 'This club is for women only.';
  return 'You cannot join this club.';
}
