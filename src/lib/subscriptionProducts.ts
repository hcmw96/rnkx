import despia from 'despia-native';
import { supabase } from '@/services/supabase';
import { REVENUECAT_OFFERING_ID } from '@/services/revenuecat';

/** App Store Connect / RevenueCat iOS product id for the monthly subscription. */
export const IOS_MONTHLY_PRODUCT_ID = 'rnkxmonthly';

export type SubscriptionLength = '1 month' | '1 year' | '1 week' | string;

export type PaywallProduct = {
  productId: string;
  /** Display title, e.g. "RNKX Premium — Monthly" */
  title: string;
  /** Subscription length in words, e.g. "1 month" */
  lengthLabel: SubscriptionLength;
  /** Localised price string from the store / SDK product object — empty when not yet available */
  displayPrice: string;
  /** Numeric price when available (for per-unit calculations) */
  price: number | null;
  currencyCode: string | null;
  /** Months in the billing period (12 for annual) — used for per-month display */
  periodMonths: number;
};

function isDespiaRuntime(): boolean {
  return navigator.userAgent.toLowerCase().includes('despia');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() !== '') return c.trim();
  }
  return null;
}

function readNumber(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
    if (typeof c === 'string' && c.trim() !== '') {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function lengthFromPackageId(id: string): { label: SubscriptionLength; periodMonths: number } {
  const lower = id.toLowerCase();
  if (lower.includes('week') || lower === '$rc_weekly') return { label: '1 week', periodMonths: 0 };
  if (
    lower.includes('year') ||
    lower.includes('annual') ||
    lower.includes('yearly') ||
    lower === '$rc_annual'
  ) {
    return { label: '1 year', periodMonths: 12 };
  }
  if (lower.includes('month') || lower === '$rc_monthly') {
    return { label: '1 month', periodMonths: 1 };
  }
  return { label: '1 month', periodMonths: 1 };
}

function lengthFromPeriod(period: unknown): { label: SubscriptionLength; periodMonths: number } | null {
  if (typeof period === 'string') {
    const p = period.toUpperCase();
    if (p === 'P1Y' || p.includes('YEAR')) return { label: '1 year', periodMonths: 12 };
    if (p === 'P1M' || p.includes('MONTH')) return { label: '1 month', periodMonths: 1 };
    if (p === 'P1W' || p.includes('WEEK')) return { label: '1 week', periodMonths: 0 };
  }
  const rec = asRecord(period);
  if (!rec) return null;
  const unit = readString(rec.unit, rec.periodUnit, rec.subscriptionPeriodUnit)?.toLowerCase();
  const value = readNumber(rec.value, rec.numberOfUnits, rec.periodValue) ?? 1;
  if (unit === 'year' || unit === 'yr') {
    return value === 1 ? { label: '1 year', periodMonths: 12 } : { label: `${value} years`, periodMonths: value * 12 };
  }
  if (unit === 'month' || unit === 'mo') {
    return value === 1 ? { label: '1 month', periodMonths: value } : { label: `${value} months`, periodMonths: value };
  }
  if (unit === 'week' || unit === 'wk') {
    return value === 1 ? { label: '1 week', periodMonths: 0 } : { label: `${value} weeks`, periodMonths: 0 };
  }
  return null;
}

function titleFor(rawTitle: string | null, lengthLabel: string): string {
  if (rawTitle && !/^product$/i.test(rawTitle)) {
    if (/month|year|annual|weekly/i.test(rawTitle)) return rawTitle;
    const cadence =
      lengthLabel === '1 year' ? 'Yearly' : lengthLabel === '1 week' ? 'Weekly' : 'Monthly';
    return `${rawTitle} — ${cadence}`;
  }
  const cadence =
    lengthLabel === '1 year' ? 'Yearly' : lengthLabel === '1 week' ? 'Weekly' : 'Monthly';
  return `RNKX Premium — ${cadence}`;
}

function normalizeOne(raw: unknown): PaywallProduct | null {
  const rec = asRecord(raw);
  if (!rec) return null;

  const nested =
    asRecord(rec.storeProduct) ??
    asRecord(rec.product) ??
    asRecord(rec.rcBillingProduct) ??
    asRecord(rec.webBillingProduct) ??
    rec;

  const productId = readString(
    nested.productId,
    nested.productIdentifier,
    nested.identifier,
    nested.store_identifier,
    nested.platform_product_identifier,
    rec.platform_product_identifier,
    rec.identifier,
    rec.productId,
  );
  if (!productId) return null;

  const packageId = readString(rec.packageType, rec.packageIdentifier, rec.identifier, productId) ?? productId;
  const subscription = asRecord(nested.subscription);
  const fromPeriod =
    lengthFromPeriod(nested.subscriptionPeriod) ??
    lengthFromPeriod(subscription?.duration) ??
    lengthFromPeriod(nested.period) ??
    lengthFromPackageId(packageId);

  const displayPrice =
    readString(
      nested.displayPrice,
      nested.localizedPrice,
      nested.localizedPriceString,
      nested.priceString,
      nested.price_string,
      rec.displayPrice,
      rec.localizedPrice,
      rec.priceString,
    ) ?? '';

  const price = readNumber(nested.price, nested.priceAmount, nested.price_amount, rec.price);
  const currencyCode = readString(
    nested.currencyCode,
    nested.currency_code,
    nested.currency,
    rec.currencyCode,
  );

  const rawTitle = readString(nested.title, nested.localizedTitle, nested.displayName, nested.display_name, rec.title);

  return {
    productId,
    title: titleFor(rawTitle, fromPeriod.label),
    lengthLabel: fromPeriod.label,
    displayPrice,
    price,
    currencyCode,
    periodMonths: fromPeriod.periodMonths,
  };
}

function collectCandidates(root: unknown, out: unknown[]): void {
  if (root == null) return;
  if (Array.isArray(root)) {
    for (const item of root) collectCandidates(item, out);
    return;
  }
  const rec = asRecord(root);
  if (!rec) return;

  if (
    readString(rec.displayPrice, rec.localizedPrice, rec.localizedPriceString, rec.priceString, rec.price_string) &&
    readString(rec.productId, rec.productIdentifier, rec.identifier, rec.platform_product_identifier)
  ) {
    out.push(rec);
  }
  if (asRecord(rec.storeProduct) || asRecord(rec.product)) {
    out.push(rec);
  }

  for (const key of [
    'availablePackages',
    'packages',
    'products',
    'offerings',
    'current',
    'all',
    'restoredData',
    'data',
  ]) {
    if (key in rec) collectCandidates(rec[key], out);
  }

  for (const value of Object.values(rec)) {
    if (Array.isArray(value) || asRecord(value)) collectCandidates(value, out);
  }
}

export function parsePaywallProducts(payload: unknown): PaywallProduct[] {
  const candidates: unknown[] = [];
  collectCandidates(payload, candidates);

  const seen = new Set<string>();
  const products: PaywallProduct[] = [];
  for (const c of candidates) {
    const p = normalizeOne(c);
    if (!p || seen.has(p.productId)) continue;
    seen.add(p.productId);
    products.push(p);
  }

  products.sort((a, b) => a.periodMonths - b.periodMonths || a.title.localeCompare(b.title));
  return products;
}

/** Per-unit price for annual plans — derived from fetched price, rounded to 2dp. */
export function formatPerMonthPrice(product: PaywallProduct): string | null {
  if (product.periodMonths < 2 || product.price == null || !Number.isFinite(product.price)) {
    return null;
  }
  const perMonth = Math.round((product.price / product.periodMonths) * 100) / 100;
  try {
    if (product.currencyCode) {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: product.currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(perMonth);
    }
  } catch {
    // fall through
  }
  return perMonth.toFixed(2);
}

/** Catalog row without a StoreKit price — used so the paywall never sits on a spinner. */
export function catalogFallbackProducts(): PaywallProduct[] {
  return [
    {
      productId: IOS_MONTHLY_PRODUCT_ID,
      title: 'RNKX Premium — Monthly',
      lengthLabel: '1 month',
      displayPrice: '',
      price: null,
      currencyCode: null,
      periodMonths: 1,
    },
  ];
}

async function despiaWatch(command: string, watch: string[], timeoutMs: number): Promise<unknown> {
  return Promise.race([
    despia(command, watch),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('despia timeout')), timeoutMs);
    }),
  ]);
}

type OfferingPackageRow = {
  packageIdentifier: string;
  productId: string;
  lengthLabel: string;
  periodMonths: number;
  title: string;
};

async function fetchOfferingPackages(appUserId: string): Promise<OfferingPackageRow[]> {
  try {
    const ua = navigator.userAgent.toLowerCase();
    const platform = ua.includes('android') ? 'android' : 'ios';
    const { data, error } = await supabase.functions.invoke<{
      packages?: OfferingPackageRow[];
    }>('get-offerings', {
      body: { appUserId, platform },
    });
    if (error || !data?.packages?.length) return [];
    return data.packages;
  } catch {
    return [];
  }
}

/**
 * Best-effort StoreKit prices via Despia.
 * Despia's documented RevenueCat surface is launchPaywall / purchase — product-catalog
 * schemes are best-effort and must fail fast so the paywall never hangs.
 */
export async function fetchPaywallProducts(externalId: string): Promise<PaywallProduct[]> {
  if (!externalId) return catalogFallbackProducts();

  const packageRows = await Promise.race([
    fetchOfferingPackages(externalId),
    new Promise<OfferingPackageRow[]>((resolve) => window.setTimeout(() => resolve([]), 2500)),
  ]);

  const productIds = [
    ...new Set(
      [...packageRows.map((p) => p.productId).filter(Boolean), IOS_MONTHLY_PRODUCT_ID],
    ),
  ];

  if (isDespiaRuntime()) {
    const encodedId = encodeURIComponent(externalId);
    const idsParam = encodeURIComponent(productIds.join(','));
    // One short attempt only — multi-scheme × long timeouts caused the stuck "Loading price…" state.
    const attempts: Array<{ command: string; watch: string[] }> = [
      {
        command: `revenuecat://getProducts?external_id=${encodedId}&products=${idsParam}`,
        watch: ['products'],
      },
      {
        command: `revenuecat://getOfferings?external_id=${encodedId}&offering=${encodeURIComponent(REVENUECAT_OFFERING_ID)}`,
        watch: ['offerings'],
      },
    ];

    for (const attempt of attempts) {
      try {
        const raw = await despiaWatch(attempt.command, attempt.watch, 3500);
        const products = parsePaywallProducts(raw).filter((p) => p.displayPrice);
        if (products.length > 0) return mergeTitlesFromPackages(products, packageRows);
      } catch {
        // try next
      }
    }

    for (const key of ['products', 'offerings', 'storeProducts']) {
      const parsed = parsePaywallProducts((window as unknown as Record<string, unknown>)[key]).filter(
        (p) => p.displayPrice,
      );
      if (parsed.length > 0) return mergeTitlesFromPackages(parsed, packageRows);
    }
  }

  if (packageRows.length > 0) {
    return packageRows.map((row) => ({
      productId: row.productId,
      title: row.title,
      lengthLabel: row.lengthLabel as SubscriptionLength,
      displayPrice: '',
      price: null,
      currencyCode: null,
      periodMonths: row.periodMonths,
    }));
  }

  return catalogFallbackProducts();
}

function mergeTitlesFromPackages(
  products: PaywallProduct[],
  packages: OfferingPackageRow[],
): PaywallProduct[] {
  if (!packages.length) return products;
  return products.map((p) => {
    const match = packages.find(
      (row) => row.productId === p.productId || row.packageIdentifier === p.productId,
    );
    if (!match) return p;
    return {
      ...p,
      title: match.title || p.title,
      lengthLabel: match.lengthLabel || p.lengthLabel,
      periodMonths: match.periodMonths || p.periodMonths,
    };
  });
}
