import { cn } from '@/lib/utils';
import { usePaywallPrice } from '@/hooks/usePaywallPrice';

type PaywallSubscriptionDisclosureProps = {
  /** Auth UUID — RevenueCat / Despia external_id for StoreKit price lookup. */
  externalId?: string | null;
  className?: string;
  /** Center on gate; left-align on full premium page. */
  align?: 'center' | 'start';
};

/**
 * Compact App Store 3.1.2 disclosure: live price when available, plus auto-renew + cancel.
 * Never shows a placeholder or hardcoded price — omits the price line until StoreKit returns one.
 */
export function PaywallSubscriptionDisclosure({
  externalId,
  className,
  align = 'center',
}: PaywallSubscriptionDisclosureProps) {
  const { status, priceLine } = usePaywallPrice(externalId);

  return (
    <div
      className={cn(
        'space-y-0.5 text-[11px] leading-relaxed text-muted-foreground',
        align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
    >
      {status === 'ready' && priceLine ? (
        <p className="font-medium text-foreground/80">{priceLine}</p>
      ) : null}
      <p>Auto-renews. Cancel anytime in App Store settings.</p>
    </div>
  );
}
