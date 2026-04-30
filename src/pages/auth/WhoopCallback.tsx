import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      console.log('[WhoopCallback] waitForSession start', { timeoutMs });
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      if (initialSession?.access_token && initialSession.user) {
        console.log('[WhoopCallback] waitForSession immediate session found', {
          userId: initialSession.user.id,
        });
        return initialSession;
      }

      return await new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>((resolve) => {
        let settled = false;
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          subscription.unsubscribe();
          console.log('[WhoopCallback] waitForSession timed out');
          resolve(null);
        }, timeoutMs);

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, newSession) => {
          console.log('[WhoopCallback] onAuthStateChange event', {
            eventHasSession: !!newSession,
            hasAccessToken: !!newSession?.access_token,
            userId: newSession?.user?.id ?? null,
          });
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
        console.log('[WhoopCallback] mounted', {
          pathname: location.pathname,
          code,
          state: searchParams.get('state'),
        });
        setMessage('Checking WHOOP callback parameters...');
        if (!code) {
          setMessage('Missing authorization code. Return to the app and try connecting WHOOP again.');
          setPhase('error');
          return;
        }
        const returnedState = searchParams.get('state');

        // Browser OAuth callback should immediately hand off to the app.
        if (location.pathname === '/auth/whoop/callback') {
          const params = new URLSearchParams({ code, state: returnedState ?? '' });
          window.location.href = `rnkx://app/whoop-callback?${params.toString()}`;
          return;
        }

        if (returnedState !== 'rnkx_whoop_auth') {
          throw new Error('Invalid state');
        }

        setMessage('Waiting for session restore...');
        const session = await waitForSession(5000);
        console.log('[WhoopCallback] waitForSession result', {
          hasSession: !!session,
          userId: session?.user?.id ?? null,
          hasAccessToken: !!session?.access_token,
        });
        if (!session?.access_token || !session.user) {
          if (!cancelled) {
            setMessage('Session not found - please sign in first (timed out after 5s waiting for auth restore).');
            setPhase('error');
          }
          return;
        }
        setMessage('Session found. Preparing WHOOP connection...');

        const uid = session.user.id;
        const [byUserId, byId] = await Promise.all([
          supabase.from('athletes').select('id').eq('user_id', uid).maybeSingle(),
          supabase.from('athletes').select('id').eq('id', uid).maybeSingle(),
        ]);
        const athleteId = (byUserId.data?.id ?? byId.data?.id) as string | undefined;
        console.log('[WhoopCallback] athlete lookup result', {
          userIdMatch: byUserId.data?.id ?? null,
          idMatch: byId.data?.id ?? null,
          athleteId: athleteId ?? null,
        });
        if (!athleteId) {
          if (!cancelled) {
            setMessage('Could not find your athlete profile. Please try again from your profile page.');
            setPhase('error');
          }
          return;
        }

        const authHeader = `Bearer ${session.access_token}`;
        const whoopAuthRequest = {
          fn: 'whoop-auth',
          body: { code, athlete_id: athleteId },
          headers: { Authorization: authHeader },
          hasValidAuthorizationToken: session.access_token.split('.').length === 3,
        };
        console.log('[WhoopCallback] whoop-auth request', whoopAuthRequest);
        setMessage('Session found. Calling whoop-auth...');
        const { data, error } = await supabase.functions.invoke('whoop-auth', {
          body: whoopAuthRequest.body,
          headers: whoopAuthRequest.headers,
        });
        console.log('[WhoopCallback] whoop-auth result', {
          data,
          error,
        });

        if (cancelled) return;

        if (error) {
          const fullError = {
            message: error.message ?? null,
            name: error.name ?? null,
            details: (error as { details?: unknown }).details ?? null,
            hint: (error as { hint?: unknown }).hint ?? null,
            code: (error as { code?: unknown }).code ?? null,
            data,
          };
          setMessage(`whoop-auth failed: ${JSON.stringify(fullError)}`);
          setPhase('error');
          return;
        }

        const errText = (data as { error?: string } | null)?.error;
        if (errText) {
          setMessage(`whoop-auth returned error payload: ${JSON.stringify(data)}`);
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
          const formatted = e instanceof Error ? `${e.name}: ${e.message}` : JSON.stringify(e);
          setMessage(`WHOOP callback error: ${formatted}`);
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
          <p className="max-w-sm text-sm text-muted-foreground">{message || 'Connecting your WHOOP account…'}</p>
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
