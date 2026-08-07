import { useEffect, useState } from 'react';
import {
  fetchPaywallProducts,
  type PaywallProduct,
} from '@/lib/subscriptionProducts';

export type PaywallPriceStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

export type PaywallPriceInfo = {
  status: PaywallPriceStatus;
  /** Localised store price string as-is, e.g. "£4.99" — never reformatted. */
  displayPrice: string | null;
  /** Short period suffix for UI, e.g. "month". */
  periodSuffix: string | null;
  /** Compact line: "£4.99/month" when ready. */
  priceLine: string | null;
};

function periodSuffixFromProduct(product: PaywallProduct): string {
  if (product.periodMonths >= 12) return 'year';
  if (product.periodMonths === 0 || /week/i.test(product.lengthLabel)) return 'week';
  return 'month';
}

/**
 * Loads the localised App Store / Play price via Despia + RevenueCat.
 * get-offerings alone has no price fields — StoreKit strings come from the native bridge.
 */
export function usePaywallPrice(externalId: string | null | undefined): PaywallPriceInfo {
  const [status, setStatus] = useState<PaywallPriceStatus>(() =>
    externalId ? 'loading' : 'unavailable',
  );
  const [product, setProduct] = useState<PaywallProduct | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!externalId) {
      setStatus('unavailable');
      setProduct(null);
      return;
    }

    setStatus('loading');
    setProduct(null);

    void (async () => {
      try {
        const rows = await fetchPaywallProducts(externalId);
        if (cancelled) return;
        const preferred =
          rows.find((r) => r.periodMonths === 1) ??
          rows.find((r) => /month/i.test(r.lengthLabel)) ??
          rows[0] ??
          null;
        if (preferred?.displayPrice) {
          setProduct(preferred);
          setStatus('ready');
        } else {
          setProduct(null);
          setStatus('unavailable');
        }
      } catch {
        if (cancelled) return;
        setProduct(null);
        setStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [externalId]);

  if (status !== 'ready' || !product?.displayPrice) {
    return {
      status: status === 'loading' ? 'loading' : 'unavailable',
      displayPrice: null,
      periodSuffix: null,
      priceLine: null,
    };
  }

  const periodSuffix = periodSuffixFromProduct(product);
  return {
    status: 'ready',
    displayPrice: product.displayPrice,
    periodSuffix,
    priceLine: `${product.displayPrice}/${periodSuffix}`,
  };
}
