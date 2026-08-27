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

const PROVIDER_LABELS: Record<string, string> = {
  GARMIN: 'Garmin',
  POLAR: 'Polar',
  COROS: 'COROS',
  FITBIT: 'Fitbit',
};

export function providerLabel(code: string): string {
  const u = code.toUpperCase();
  return PROVIDER_LABELS[u] ?? code;
}
