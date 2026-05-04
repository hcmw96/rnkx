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

function tryDecodeWhoopState(returnedState: string | null): {
  token: string | null;
  athlete_id: string | null;
} | null {
  if (!returnedState?.trim()) return null;
  try {
    const base64 = returnedState.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded)) as { nonce?: string; token?: string; athlete_id?: string };
    if (decoded.nonce !== 'rnkx_whoop_auth') return null;
    const token = typeof decoded.token === 'string' ? decoded.token.trim() : '';
    const athlete_id = typeof decoded.athlete_id === 'string' ? decoded.athlete_id.trim() : '';
    if (!token && !athlete_id) return null;
    return { token: token || null, athlete_id: athlete_id || null };
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

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription.unsubscribe();
      resolve(null);
    }, timeoutMs);
  });
}

export default function WhoopCallback() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');

  const rawStateParam = searchParams.get('state') ?? '';
  const statePreviewFirst50 =
    location.pathname === '/app/whoop-callback' ? rawStateParam.slice(0, 50) : null;

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

        if (fromState?.token) {
          const { data: userData, error: userErr } = await supabase.auth.getUser(fromState.token);
          if (!userErr && userData.user) {
            accessToken = fromState.token;
            uid = userData.user.id;
          }
        }

        if (!accessToken || !uid) {
          const waited = await waitForSession(3000);
          if (waited?.access_token && waited.user && !cancelled) {
            accessToken = waited.access_token;
            uid = waited.user.id;
          } else if (fromState === null && !cancelled) {
            setMessage(GUIDED_PROFILE_MESSAGE);
            setPhase('guided');
            return;
          }
        }

        let athleteId =
          (fromState?.athlete_id && fromState.athlete_id.trim() !== '' ? fromState.athlete_id : null) ?? null;

        if (!athleteId && uid) {
          const [byUserId, byId] = await Promise.all([
            supabase.from('athletes').select('id').eq('user_id', uid).maybeSingle(),
            supabase.from('athletes').select('id').eq('id', uid).maybeSingle(),
          ]);
          athleteId = ((byUserId.data?.id ?? byId.data?.id) as string | undefined) ?? null;
        }

        if (!athleteId) {
          if (!cancelled) {
            setMessage(
              fromState?.token && !accessToken
                ? 'Session not found - please sign in first'
                : 'Could not find your athlete profile. Please try again from your profile page.',
            );
            setPhase('error');
          }
          return;
        }

        const invokePayload: { body: { code: string; athlete_id: string }; headers?: { Authorization: string } } = {
          body: { code, athlete_id: athleteId },
        };
        if (accessToken) {
          invokePayload.headers = { Authorization: `Bearer ${accessToken}` };
        }

        const { data, error } = await supabase.functions.invoke('whoop-auth', invokePayload);

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
      {statePreviewFirst50 != null ? (
        <div className="w-full max-w-lg rounded-md border border-border bg-muted/30 px-3 py-2 text-left">
          <p className="text-xs font-medium text-muted-foreground">Raw state query (first 50 chars)</p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">
            {rawStateParam.length > 0 ? statePreviewFirst50 : '(empty)'}
          </p>
        </div>
      ) : null}
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
