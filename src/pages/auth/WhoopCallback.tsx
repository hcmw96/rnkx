import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDespia } from '@/services/despia';
import { supabase } from '@/services/supabase';

type Phase = 'loading' | 'success' | 'error' | 'guided';

const GUIDED_PROFILE_MESSAGE =
  'WHOOP connected successfully! Please go back to your profile to see your connection.';

function tryDecodeWhoopState(returnedState: string | null): { token: string } | null {
  if (!returnedState?.trim()) return null;
  try {
    const base64 = returnedState.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded)) as { nonce?: string; token?: string };
    if (decoded.nonce !== 'rnkx_whoop_auth') return null;
    const raw = decoded.token;
    const token = typeof raw === 'string' ? raw.trim() : '';
    if (!token) return null;
    return { token };
  } catch {
    return null;
  }
}

/** First getSession, then subscribe for up to timeoutMs — used when OAuth state/token is unavailable. */
async function waitForSession(timeoutMs: number): Promise<Session | null> {
  const {
    data: { session: initialSession },
  } = await supabase.auth.getSession();
  if (initialSession?.access_token && initialSession.user) {
    return initialSession;
  }

  return await new Promise((resolve) => {
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

export default function WhoopCallback() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

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

        const fromState = tryDecodeWhoopState(returnedState);
        let accessToken: string | null = null;
        let uid: string | null = null;

        if (fromState) {
          const { data: userData, error: userErr } = await supabase.auth.getUser(fromState.token);
          if (!userErr && userData.user) {
            accessToken = fromState.token;
            uid = userData.user.id;
          }
        }

        const stateWasUnusable = fromState === null;

        if (!accessToken || !uid) {
          if (stateWasUnusable) {
            const waited = await waitForSession(3000);
            if (waited?.access_token && waited.user && !cancelled) {
              accessToken = waited.access_token;
              uid = waited.user.id;
            } else if (!cancelled) {
              setMessage(GUIDED_PROFILE_MESSAGE);
              setPhase('guided');
              return;
            }
          } else {
            if (!cancelled) {
              setMessage('Session not found - please sign in first');
              setPhase('error');
            }
            return;
          }
        }

        if (!accessToken || !uid) return;
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
          headers: { Authorization: `Bearer ${accessToken}` },
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
      ) : phase === 'guided' ? (
        <>
          <p className="max-w-md text-sm text-foreground">{message}</p>
          <Button type="button" onClick={() => navigate('/app/profile', { replace: true })}>
            Go to Profile
          </Button>
        </>
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
