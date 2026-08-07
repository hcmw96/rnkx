import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PaywallSubscriptionDisclosure } from '@/components/PaywallSubscriptionDisclosure';
import { launchNativePaywall } from '@/services/revenuecat';
import { supabase } from '@/services/supabase';

function isDespiaRuntime(): boolean {
  return navigator.userAgent.toLowerCase().includes('despia');
}

export default function PremiumPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const despia = isDespiaRuntime();
  const autoLaunchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      setReady(true);
      if (uid && isDespiaRuntime() && !autoLaunchedRef.current) {
        autoLaunchedRef.current = true;
        launchNativePaywall(uid);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">
      <div className="mx-auto max-w-lg space-y-8 px-4 py-8 pb-16">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>

        <header className="space-y-2 text-center sm:text-left">
          <h1 className="type-page-title">RNKX Premium</h1>
          <p className="text-sm text-muted-foreground">
            Unlock friends, clubs, messaging, and performance insights.
          </p>
        </header>

        {!ready ? null : !despia ? (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
            Subscriptions are available in the RNKX iOS app
          </p>
        ) : !userId ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Sign in to manage your subscription.</p>
            <Button type="button" className="w-full" onClick={() => navigate('/auth', { replace: true })}>
              Sign in
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 sm:items-start">
            <Button type="button" className="w-full" onClick={() => launchNativePaywall(userId)}>
              View plans
            </Button>
            <PaywallSubscriptionDisclosure externalId={userId} align="start" className="w-full" />
            <p className="w-full text-center text-[11px] leading-relaxed text-muted-foreground sm:text-left">
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground hover:decoration-foreground/50"
              >
                Terms
              </a>
              <span className="mx-1.5 text-muted-foreground/50" aria-hidden>
                ·
              </span>
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground hover:decoration-foreground/50"
              >
                Privacy
              </a>
            </p>
            <Button type="button" variant="link" className="h-auto p-0" onClick={() => navigate('/app/profile')}>
              Back to profile
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
