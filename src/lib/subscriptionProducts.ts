import despia from 'despia-native';
import { supabase } from '@/services/supabase';
import { REVENUECAT_OFFERING_ID } from '@/services/revenuecat';

export type SubscriptionLength = '1 month' | '1 year' | '1 week' | string;

export type PaywallProduct = {
  productId: string;
  /** Display title, e.g. "RNKX Premium — Monthly" */
  title: string;
  /** Subscription length in words, e.g. "1 month" */
  lengthLabel: SubscriptionLength;
  /** Localised price string from the store / SDK product object */
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

/**
 * Display title from store title + billing cadence.
 * productId is intentionally not used: cadence already comes from period/package
 * parsing, and store titles are preferred over opaque store SKUs for the paywall line.
 */
function titleFor(rawTitle: string | null, lengthLabel: string): string {
  if (rawTitle && !/^product$/i.test(rawTitle)) {
    // Prefer store title when it already includes cadence
    if (/month|year|annual|weekly/i.test(rawTitle)) return rawTitle;
    const cadence =
      lengthLabel === '1 year' ? 'Yearly' : lengthLabel === '1 week' ? 'Weekly' : 'Monthly';
    return `${rawTitle} — ${cadence}`;
  }
  const cadence =
    lengthLabel === '1 year' ? 'Yearly' : lengthLabel === '1 week' ? 'Weekly' : 'Monthly';
  return `RNKX Premium — ${cadence}`;
}

/** Narrow shapes we actually read from Despia / RevenueCat product payloads. */
type StoreSubscriptionShape = {
  duration?: unknown;
};

type StoreProductShape = {
  productId?: unknown;
  productIdentifier?: unknown;
  identifier?: unknown;
  store_identifier?: unknown;
  platform_product_identifier?: unknown;
  packageType?: unknown;
  packageIdentifier?: unknown;
  subscriptionPeriod?: unknown;
  /** Some RC / StoreKit bridges nest period under subscription.duration */
  subscription?: StoreSubscriptionShape | null;
  period?: unknown;
  displayPrice?: unknown;
  localizedPrice?: unknown;
  localizedPriceString?: unknown;
  priceString?: unknown;
  price_string?: unknown;
  price?: unknown;
  priceAmount?: unknown;
  price_amount?: unknown;
  currencyCode?: unknown;
  currency_code?: unknown;
  currency?: unknown;
  title?: unknown;
  localizedTitle?: unknown;
  displayName?: unknown;
  display_name?: unknown;
  storeProduct?: unknown;
  product?: unknown;
  rcBillingProduct?: unknown;
  webBillingProduct?: unknown;
};

function asStoreProduct(value: unknown): StoreProductShape | null {
  const rec = asRecord(value);
  if (!rec) return null;
  return {
    productId: rec.productId,
    productIdentifier: rec.productIdentifier,
    identifier: rec.identifier,
    store_identifier: rec.store_identifier,
    platform_product_identifier: rec.platform_product_identifier,
    packageType: rec.packageType,
    packageIdentifier: rec.packageIdentifier,
    subscriptionPeriod: rec.subscriptionPeriod,
    subscription: asRecord(rec.subscription),
    period: rec.period,
    displayPrice: rec.displayPrice,
    localizedPrice: rec.localizedPrice,
    localizedPriceString: rec.localizedPriceString,
    priceString: rec.priceString,
    price_string: rec.price_string,
    price: rec.price,
    priceAmount: rec.priceAmount,
    price_amount: rec.price_amount,
    currencyCode: rec.currencyCode,
    currency_code: rec.currency_code,
    currency: rec.currency,
    title: rec.title,
    localizedTitle: rec.localizedTitle,
    displayName: rec.displayName,
    display_name: rec.display_name,
    storeProduct: rec.storeProduct,
    product: rec.product,
    rcBillingProduct: rec.rcBillingProduct,
    webBillingProduct: rec.webBillingProduct,
  };
}

function subscriptionDuration(subscription: StoreSubscriptionShape | null | undefined): unknown {
  if (!subscription || typeof subscription !== 'object') return null;
  return 'duration' in subscription ? subscription.duration : null;
}

function normalizeOne(raw: unknown): PaywallProduct | null {
  const rec = asStoreProduct(raw);
  if (!rec) return null;

  // Unwrap nested storeProduct / product
  const nested =
    asStoreProduct(rec.storeProduct) ??
    asStoreProduct(rec.product) ??
    asStoreProduct(rec.rcBillingProduct) ??
    asStoreProduct(rec.webBillingProduct) ??
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
  const fromPeriod =
    lengthFromPeriod(nested.subscriptionPeriod) ??
    lengthFromPeriod(subscriptionDuration(nested.subscription)) ??
    lengthFromPeriod(nested.period) ??
    lengthFromPackageId(packageId);
  const displayPrice = readString(
    nested.displayPrice,
    nested.localizedPrice,
    nested.localizedPriceString,
    nested.priceString,
    nested.price_string,
    rec.displayPrice,
    rec.localizedPrice,
    rec.priceString,
  );
  if (!displayPrice) return null;

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

  // Likely product / package objects
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

  // Offering map keyed by id
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

  // Prefer monthly before yearly for stable UI order
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

async function despiaWatch(command: string, watch: string[], timeoutMs = 10_000): Promise<unknown> {
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
 * Load subscription products with localised StoreKit / Play prices via Despia + RevenueCat.
 * Returns [] when nothing with a real display price is available (caller must keep UI in loading / disabled).
 */
export async function fetchPaywallProducts(externalId: string): Promise<PaywallProduct[]> {
  if (!externalId) return [];

  const encodedId = encodeURIComponent(externalId);
  const offering = encodeURIComponent(REVENUECAT_OFFERING_ID);
  const packageRows = await fetchOfferingPackages(externalId);
  const productIds = packageRows.map((p) => p.productId).filter(Boolean);
  const idsParam = encodeURIComponent(productIds.join(','));

  if (isDespiaRuntime()) {
    const attempts: Array<{ command: string; watch: string[] }> = [
      {
        command: `revenuecat://getOfferings?external_id=${encodedId}`,
        watch: ['offerings'],
      },
      {
        command: `revenuecat://offerings?external_id=${encodedId}&offering=${offering}`,
        watch: ['offerings'],
      },
      {
        command: `revenuecat://products?external_id=${encodedId}&offering=${offering}`,
        watch: ['products'],
      },
      {
        command: `revenuecat://getProducts?external_id=${encodedId}&offering=${offering}`,
        watch: ['products', 'offerings'],
      },
    ];

    if (productIds.length > 0) {
      attempts.unshift(
        {
          command: `revenuecat://getProducts?external_id=${encodedId}&products=${idsParam}`,
          watch: ['products'],
        },
        {
          command: `revenuecat://products?external_id=${encodedId}&ids=${idsParam}`,
          watch: ['products'],
        },
      );
    }

    for (const attempt of attempts) {
      try {
        const raw = await despiaWatch(attempt.command, attempt.watch);
        const products = parsePaywallProducts(raw);
        if (products.length > 0) return mergeTitlesFromPackages(products, packageRows);
        for (const key of attempt.watch) {
          const fromWindow = (window as unknown as Record<string, unknown>)[key];
          const parsed = parsePaywallProducts(fromWindow);
          if (parsed.length > 0) return mergeTitlesFromPackages(parsed, packageRows);
        }
      } catch {
        // try next scheme
      }
    }

    // Prefetched / mirrored RC product payloads some Despia builds expose on window
    for (const key of ['offerings', 'products', 'rcOfferings', 'storeProducts', 'availablePackages']) {
      const parsed = parsePaywallProducts((window as unknown as Record<string, unknown>)[key]);
      if (parsed.length > 0) return mergeTitlesFromPackages(parsed, packageRows);
    }
  }

  return [];
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
