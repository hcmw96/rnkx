import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isAthleteProfileComplete } from '@/lib/authPostLogin';
import { completeAppleSignInFromRedirect } from '@/lib/appleSignIn';
import { getPendingLeagueInvitePath } from '@/lib/shareLeagueInvite';
import { supabase } from '@/services/supabase';

type Phase = 'loading' | 'error';

export default function AppleAuthComplete() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('Finishing Apple Sign In…');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await completeAppleSignInFromRedirect(searchParams);
      if (cancelled) return;

      if (result.error) {
        setMessage(result.error.message);
        setPhase('error');
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate('/onboarding', { replace: true });
        return;
      }

      const complete = await isAthleteProfileComplete(user.id);
      navigate(complete ? (getPendingLeagueInvitePath() ?? '/app') : '/onboarding', { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  if (phase === 'error') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
        <p className="text-sm text-red-400">{message}</p>
        <Button asChild variant="outline">
          <Link to="/auth">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
      <Loader2 className="h-8 w-8 animate-spin text-lime-400" aria-hidden />
      <p className="text-sm text-white/80">{message}</p>
    </div>
  );
}
