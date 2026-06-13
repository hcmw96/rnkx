export type ClubGender = 'male' | 'female' | 'mixed';

export const CLUB_GENDER_OPTIONS: { value: ClubGender; label: string }[] = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'male', label: 'Men only' },
  { value: 'female', label: 'Women only' },
];

export function normalizeClubGender(value: string | null | undefined): ClubGender {
  if (value === 'male' || value === 'female') return value;
  return 'mixed';
}

export function clubGenderLabel(value: string | null | undefined): string {
  return CLUB_GENDER_OPTIONS.find((o) => o.value === value)?.label ?? 'Mixed';
}

/** Chip label for gender-restricted clubs; null for mixed / unknown. */
export function clubGenderChipLabel(value: string | null | undefined): string | null {
  const normalized = normalizeClubGender(value);
  if (normalized === 'male') return 'Men only';
  if (normalized === 'female') return 'Women only';
  return null;
}

export type AthleteProfileGender = 'male' | 'female';

export const ATHLETE_GENDER_OPTIONS: { value: AthleteProfileGender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export function athleteProfileGenderLabel(value: string | null | undefined): string {
  if (value === 'male') return 'Male';
  if (value === 'female') return 'Female';
  return 'Not set';
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

export function clubGendersCreatableByAthlete(
  athleteGender: string | null | undefined,
): ClubGender[] {
  if (athleteGender === 'male' || athleteGender === 'female') {
    return ['mixed', athleteGender];
  }
  return ['mixed'];
}

export function athleteCanCreateClubGender(
  clubGender: ClubGender,
  athleteGender: string | null | undefined,
): boolean {
  return clubGendersCreatableByAthlete(athleteGender).includes(clubGender);
}

export function clubGenderCreateMessage(clubGender: ClubGender): string {
  if (clubGender === 'male') return 'Only athletes with male on their profile can create a men\'s club.';
  if (clubGender === 'female') return 'Only athletes with female on their profile can create a women\'s club.';
  return 'You cannot create this club.';
}
