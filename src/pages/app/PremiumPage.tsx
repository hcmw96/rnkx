import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { openExternalUrl } from '@/lib/openExternalUrl';
import {
  catalogFallbackProducts,
  fetchPaywallProducts,
  formatPerMonthPrice,
  IOS_MONTHLY_PRODUCT_ID,
  type PaywallProduct,
} from '@/lib/subscriptionProducts';
import { supabase } from '@/services/supabase';
import {
  purchaseSubscriptionProduct,
  restoreInAppPurchasesAndApplyPremium,
} from '@/services/revenuecat';
import { toast } from 'sonner';

const BENEFITS = [
  'Friends & friend leaderboards',
  'Clubs & group chat',
  'Performance insights & recovery',
  'Direct messaging',
] as const;

/** Apple standard Licensed Application End User License Agreement (Guideline 3.1.2). */
const TERMS_OF_USE_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** Hosted privacy policy (same content as in-app /privacy). */
const PRIVACY_POLICY_URL = 'https://rnkx.netlify.app/privacy';

const AUTO_RENEWAL_DISCLOSURE =
  'Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. Manage or cancel your subscription in your Account Settings.';

function isDespiaRuntime(): boolean {
  return navigator.userAgent.toLowerCase().includes('despia');
}

export default function PremiumPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  // Show plan card immediately — never leave the reviewer staring at a spinner.
  const [products, setProducts] = useState<PaywallProduct[]>(() => catalogFallbackProducts());
  const [loadingProducts, setLoadingProducts] = useState(true);

  const loadProducts = useCallback(async (uid: string) => {
    setLoadingProducts(true);
    try {
      const rows = await fetchPaywallProducts(uid);
      setProducts(rows.length > 0 ? rows : catalogFallbackProducts());
    } catch {
      setProducts(catalogFallbackProducts());
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        await loadProducts(uid);
      } else {
        setLoadingProducts(false);
      }
    })();
  }, [loadProducts]);

  async function handleRestore() {
    setRestoring(true);
    try {
      const result = await restoreInAppPurchasesAndApplyPremium();
      if (result === 'premium') toast.success('Premium restored!');
      else if (result === 'not_despia') toast.message('Restore is available in the RNKX iPhone app.');
      else if (result === 'restore_error') toast.error('Could not restore purchases.');
      else toast.message('No active subscription found.');
    } finally {
      setRestoring(false);
    }
  }

  function handleSubscribe() {
    if (!userId) {
      toast.message('Sign in to upgrade', { description: 'Open the RNKX app and log in first.' });
      navigate('/auth', { replace: true });
      return;
    }
    if (!isDespiaRuntime()) {
      toast.message('Open RNKX on iPhone', {
        description: 'Subscriptions are purchased through the App Store in the Despia app build.',
      });
      return;
    }
    setPurchasing(true);
    try {
      const storeProductId =
        products.find((p) => p.displayPrice)?.productId ??
        products[0]?.productId ??
        IOS_MONTHLY_PRODUCT_ID;
      // Direct Despia purchase → Apple’s StoreKit sheet (localised price). Prefer this over
      // launchPaywall so we don’t depend on a RevenueCat Paywalls template being configured.
      purchaseSubscriptionProduct(userId, storeProductId);
    } finally {
      window.setTimeout(() => setPurchasing(false), 2000);
    }
  }

  const purchaseDisabled = !userId || purchasing;

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">
      <div className="mx-auto max-w-lg space-y-8 px-4 py-8 pb-16">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>

        <header className="space-y-2 text-center sm:text-left">
          <h1 className="type-page-title">RNKX Premium</h1>
          <p className="text-sm text-muted-foreground">Unlock the full social and insights experience.</p>
        </header>

        <ul className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
          {BENEFITS.map((line) => (
            <li key={line} className="flex gap-3 text-sm text-foreground">
              <span className="mt-0.5 text-neon-lime" aria-hidden>
                ✓
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <section className="space-y-3" aria-busy={loadingProducts} aria-label="Subscription options">
          <h2 className="text-sm font-semibold text-foreground">Choose a plan</h2>

          {products.map((product) => {
            const perMonth = formatPerMonthPrice(product);
            return (
              <div
                key={product.productId}
                className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">{product.title}</p>
                  <p className="text-sm text-muted-foreground">Length: {product.lengthLabel}</p>
                  {product.displayPrice ? (
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {product.displayPrice}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        / {product.lengthLabel}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {loadingProducts
                        ? 'Fetching your local App Store price…'
                        : 'Tap Continue — the App Store shows the localised price before you pay.'}
                    </p>
                  )}
                  {perMonth ? (
                    <p className="text-xs text-muted-foreground">{perMonth} / month (billed annually)</p>
                  ) : null}
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            className="w-full font-semibold bg-neon-lime text-black hover:bg-neon-lime/90"
            disabled={purchaseDisabled}
            onClick={() => handleSubscribe()}
          >
            {purchasing ? 'Opening App Store…' : 'Continue'}
          </Button>
        </section>

        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            className="w-full border-border"
            disabled={restoring}
            onClick={() => void handleRestore()}
          >
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => navigate(userId ? '/app/profile' : '/auth')}
          >
            {userId ? 'Back to profile' : 'Sign in'}
          </Button>
        </div>

        <footer className="space-y-3 border-t border-border/60 pt-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">{AUTO_RENEWAL_DISCLOSURE}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <button
              type="button"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => openExternalUrl(TERMS_OF_USE_URL)}
            >
              Terms of Use
            </button>
            <span className="text-muted-foreground/50" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => openExternalUrl(PRIVACY_POLICY_URL)}
            >
              Privacy Policy
            </button>
          </p>
        </footer>
      </div>
    </div>
  );
}
