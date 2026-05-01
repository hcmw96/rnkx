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

        if (!returnedState) {
          throw new Error('Invalid state');
        }

        let decoded: { nonce?: string; token?: string };
        try {
          const base64 = returnedState.replace(/-/g, '+').replace(/_/g, '/');
          const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
          decoded = JSON.parse(atob(padded)) as { nonce?: string; token?: string };
        } catch {
          throw new Error('Invalid state');
        }
        if (decoded.nonce !== 'rnkx_whoop_auth' || !decoded.token) {
          throw new Error('Invalid state');
        }
        const accessToken = decoded.token;

        const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
        if (userErr || !userData.user) {
          if (!cancelled) {
            setMessage('Session not found - please sign in first');
            setPhase('error');
          }
          return;
        }

        const uid = userData.user.id;
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
