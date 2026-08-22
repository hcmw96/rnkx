import {
  CorosLogo,
  FitbitLogo,
  GarminLogo,
  PolarLogo,
} from '@/components/BrandLogos';

/** Providers offered in the Terra widget (must match terra-widget-session). */
export const TERRA_WIDGET_PROVIDERS = [
  { id: 'GARMIN', label: 'Garmin', Logo: GarminLogo },
  { id: 'POLAR', label: 'Polar', Logo: PolarLogo },
  { id: 'COROS', label: 'COROS', Logo: CorosLogo },
  { id: 'FITBIT', label: 'Fitbit', Logo: FitbitLogo },
] as const;

/** Labels for Terra widget providers plus legacy / native codes still shown on connected rows. */
const PROVIDER_LABELS: Record<string, string> = {
  GARMIN: 'Garmin',
  POLAR: 'Polar',
  COROS: 'COROS',
  FITBIT: 'Fitbit',
  STRAVA: 'Strava',
  WHOOP: 'WHOOP',
  OURA: 'Oura',
  SAMSUNG: 'Samsung',
};

export function providerLabel(code: string): string {
  const u = code.toUpperCase();
  return PROVIDER_LABELS[u] ?? code;
}
