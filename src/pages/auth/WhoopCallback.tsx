import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDespia } from '@/services/despia';
import { supabase } from '@/services/supabase';

type Phase = 'loading' | 'success' | 'error';

export default function WhoopCallback() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function waitForSession(timeoutMs: number) {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      if (initialSession?.access_token && initialSession.user) {
        return initialSession;
      }

      return await new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>((resolve) => {
        let settled = false;
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          subscription.unsubscribe();
          resolve(null);
        }, timeoutMs);

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, newSession) => {
          if (settled) return;
          if (!newSession?.access_token || !newSession.user) return;
          settled = true;
          window.clearTimeout(timeoutId);
          subscription.unsubscribe();
          resolve(newSession);
        });
      });
    }

    void (async () => {
      try {
        const code = searchParams.get('code');
        if (!code) {
          setMessage('Missing authorization code. Return to the app and try connecting WHOOP again.');
          setPhase('error');
          return;
        }
        const returnedState = searchParams.get('state');

        // OAuth callback should hand off to app only when running inside Despia runtime.
        if (location.pathname === '/auth/whoop/callback' && isDespia()) {
          const params = new URLSearchParams({ code, state: returnedState ?? '' });
          window.location.href = `rnkx://app/whoop-callback?${params.toString()}`;
          return;
        }

        if (returnedState !== 'rnkx_whoop_auth') {
          throw new Error('Invalid state');
        }

        const session = await waitForSession(5000);
        if (!session?.access_token || !session.user) {
          if (!cancelled) {
            setMessage('Session not found - please sign in first');
            setPhase('error');
          }
          return;
        }

        const uid = session.user.id;
        const [byUserId, byId] = await Promise.all([
          supabase.from('athletes').select('id').eq('user_id', uid).maybeSingle(),
          supabase.from('athletes').select('id').eq('id', uid).maybeSingle(),
        ]);
        const athleteId = (byUserId.data?.id ?? byId.data?.id) as string | undefined;
        if (!athleteId) {
          if (!cancelled) {
            setMessage('Could not find your athlete profile. Please try again from your profile page.');
            setPhase('error');
          }
          return;
        }

        const { data, error } = await supabase.functions.invoke('whoop-auth', {
          body: { code, athlete_id: athleteId },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (cancelled) return;

        if (error) {
          setMessage(error.message || 'Could not complete WHOOP connection.');
          setPhase('error');
          return;
        }

        const errText = (data as { error?: string } | null)?.error;
        if (errText) {
          setMessage(typeof errText === 'string' ? errText : 'Could not complete WHOOP connection.');
          setPhase('error');
          return;
        }

        setMessage('WHOOP connected. Redirecting to your profile...');
        setPhase('success');
        window.location.href = 'rnkx://app/profile';
        setTimeout(() => {
          if (!cancelled) navigate('/app/profile', { replace: true });
        }, 1200);
      } catch (e) {
        if (!cancelled) {
          setMessage(e instanceof Error ? e.message : 'Invalid state');
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, location.pathname, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      {phase === 'loading' ? (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="Connecting WHOOP" />
          <p className="max-w-sm text-sm text-muted-foreground">Connecting your WHOOP account…</p>
        </>
      ) : phase === 'success' ? (
        <p className="max-w-md text-sm text-foreground">{message}</p>
      ) : (
        <>
          <p className="max-w-md text-sm text-destructive">{message}</p>
          <Button asChild variant="outline">
            <Link to="/app/profile">Back to profile</Link>
          </Button>
        </>
      )}
    </div>
  );
}
