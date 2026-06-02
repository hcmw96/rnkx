import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { supabase } from '@/services/supabase';
import { presentPaywall, restoreInAppPurchasesAndApplyPremium } from '@/services/revenuecat';
import { toast } from 'sonner';

const BENEFITS = [
  'Friends & friend leaderboards',
  'Clubs & group chat',
  'Performance insights & recovery',
  'Direct messaging',
] as const;

export default function PremiumPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, []);

  async function handleUpgrade() {
    if (!userId) {
      toast.message('Sign in to upgrade', { description: 'Open the RNKX app and log in first.' });
      navigate('/auth', { replace: true });
      return;
    }
    const athleteId = await resolveAthleteId(userId);
    presentPaywall(athleteId ?? userId);
  }

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

  return (
    <div className="fixed inset-0 overflow-y-auto bg-background">
      <div className="mx-auto max-w-lg space-y-8 px-4 py-8">
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

        <div className="flex flex-col gap-3">
          <Button type="button" className="w-full font-semibold bg-neon-lime text-black hover:bg-neon-lime/90" onClick={() => void handleUpgrade()}>
            Upgrade
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full border-border"
            disabled={restoring}
            onClick={() => void handleRestore()}
          >
            {restoring ? 'Restoring…' : 'Restore purchases'}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => navigate(userId ? '/app/profile' : '/auth')}>
            {userId ? 'Back to profile' : 'Sign in'}
          </Button>
        </div>
      </div>
    </div>
  );
}
