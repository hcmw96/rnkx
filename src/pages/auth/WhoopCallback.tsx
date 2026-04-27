import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/services/supabase';

type Phase = 'loading' | 'error';

export default function WhoopCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const returnedState = searchParams.get('state');
        const savedState = sessionStorage.getItem('whoop_oauth_state');
        if (returnedState !== savedState) {
          throw new Error('Invalid state');
        }
        sessionStorage.removeItem('whoop_oauth_state');

        const code = searchParams.get('code');
        if (!code) {
          setMessage('Missing authorization code. Return to the app and try connecting WHOOP again.');
          setPhase('error');
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) {
            setMessage('You need to be signed in to finish connecting WHOOP. Sign in, then use Connect WHOOP from your profile.');
            setPhase('error');
          }
          return;
        }

        const { data, error } = await supabase.functions.invoke('whoop-auth', {
          body: { code },
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

        navigate('/app/profile', { replace: true });
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
  }, [searchParams, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      {phase === 'loading' ? (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="Connecting WHOOP" />
          <p className="max-w-sm text-sm text-muted-foreground">Connecting your WHOOP account…</p>
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
