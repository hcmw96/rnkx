import {
  CorosLogo,
  FitbitLogo,
  GarminLogo,
  OuraLogo,
  PolarLogo,
  SamsungLogo,
  StravaLogo,
  WhoopLogo,
} from '@/components/BrandLogos';

/** Providers shown in the Terra “Connect Wearables” grid (non-Apple). */
export const TERRA_WIDGET_PROVIDERS = [
  { id: 'GARMIN', label: 'Garmin', Logo: GarminLogo },
  { id: 'POLAR', label: 'Polar', Logo: PolarLogo },
  { id: 'COROS', label: 'COROS', Logo: CorosLogo },
  { id: 'FITBIT', label: 'Fitbit', Logo: FitbitLogo },
  { id: 'OURA', label: 'Oura', Logo: OuraLogo },
  { id: 'SAMSUNG', label: 'Samsung', Logo: SamsungLogo },
  { id: 'STRAVA', label: 'Strava', Logo: StravaLogo },
  { id: 'WHOOP', label: 'WHOOP', Logo: WhoopLogo },
] as const;

export function providerLabel(code: string): string {
  const u = code.toUpperCase();
  const row = TERRA_WIDGET_PROVIDERS.find((p) => p.id === u);
  return row?.label ?? code;
}
