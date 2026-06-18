import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isAthleteProfileComplete } from '@/lib/authPostLogin';
import { completeAppleSignInFromRedirect } from '@/lib/appleSignIn';
import { getPendingLeagueInvitePath } from '@/lib/shareLeagueInvite';

type Phase = 'loading' | 'error';

export default function AppleAuthComplete() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('Signing you in with Apple…');

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

      const userId = result.userId;
      if (!userId) {
        setMessage('Signed in with Apple but no user session was created.');
        setPhase('error');
        return;
      }

      const complete = await isAthleteProfileComplete(userId);
      if (cancelled) return;
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
