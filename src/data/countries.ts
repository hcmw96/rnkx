export interface Country {
  name: string;
  flag: string;
  code: string;
}

/** Regional-indicator pair from ISO 3166-1 alpha-2 */
function flagFromCode(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('');
}

/** Top ~50 countries by population (UN / World Bank order, rounded). */
const POPULATION_ORDER: { name: string; code: string }[] = [
  { name: 'India', code: 'IN' },
  { name: 'China', code: 'CN' },
  { name: 'United States', code: 'US' },
  { name: 'Indonesia', code: 'ID' },
  { name: 'Pakistan', code: 'PK' },
  { name: 'Nigeria', code: 'NG' },
  { name: 'Brazil', code: 'BR' },
  { name: 'Bangladesh', code: 'BD' },
  { name: 'Russia', code: 'RU' },
  { name: 'Mexico', code: 'MX' },
  { name: 'Ethiopia', code: 'ET' },
  { name: 'Japan', code: 'JP' },
  { name: 'Philippines', code: 'PH' },
  { name: 'Egypt', code: 'EG' },
  { name: 'DR Congo', code: 'CD' },
  { name: 'Vietnam', code: 'VN' },
  { name: 'Iran', code: 'IR' },
  { name: 'Turkey', code: 'TR' },
  { name: 'Germany', code: 'DE' },
  { name: 'Thailand', code: 'TH' },
  { name: 'United Kingdom', code: 'GB' },
  { name: 'Tanzania', code: 'TZ' },
  { name: 'France', code: 'FR' },
  { name: 'South Africa', code: 'ZA' },
  { name: 'Italy', code: 'IT' },
  { name: 'Kenya', code: 'KE' },
  { name: 'Myanmar', code: 'MM' },
  { name: 'Colombia', code: 'CO' },
  { name: 'South Korea', code: 'KR' },
  { name: 'Sudan', code: 'SD' },
  { name: 'Uganda', code: 'UG' },
  { name: 'Spain', code: 'ES' },
  { name: 'Algeria', code: 'DZ' },
  { name: 'Iraq', code: 'IQ' },
  { name: 'Argentina', code: 'AR' },
  { name: 'Afghanistan', code: 'AF' },
  { name: 'Yemen', code: 'YE' },
  { name: 'Canada', code: 'CA' },
  { name: 'Angola', code: 'AO' },
  { name: 'Ukraine', code: 'UA' },
  { name: 'Morocco', code: 'MA' },
  { name: 'Poland', code: 'PL' },
  { name: 'Uzbekistan', code: 'UZ' },
  { name: 'Malaysia', code: 'MY' },
  { name: 'Peru', code: 'PE' },
  { name: 'Ghana', code: 'GH' },
  { name: 'Saudi Arabia', code: 'SA' },
  { name: 'Nepal', code: 'NP' },
  { name: 'Mozambique', code: 'MZ' },
  { name: 'Australia', code: 'AU' },
];

export const countries: Country[] = POPULATION_ORDER.map(({ name, code }) => ({
  name,
  code,
  flag: flagFromCode(code),
}));

export function getCountryByName(name: string): Country | null {
  return countries.find((c) => c.name === name) ?? null;
}

export function getCountryFlag(name: string): string {
  return getCountryByName(name)?.flag ?? '';
}
