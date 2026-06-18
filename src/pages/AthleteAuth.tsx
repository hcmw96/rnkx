import { motion } from 'framer-motion';
import { FormEvent, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { WelcomeScreen } from '@/components/onboarding/WelcomeScreen';
import RNKXLogo from '@/components/RNKXLogo';
import { AppleSignInButton } from '@/components/auth/AppleSignInButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isAthleteProfileComplete } from '@/lib/authPostLogin';
import { isDespiaIOS, loadAppleAuthSdk, signInWithApple } from '@/lib/appleSignIn';
import { getPendingLeagueInvitePath } from '@/lib/shareLeagueInvite';
import { supabase } from '@/services/supabase';

export default function AthleteAuth() {
  const navigate = useNavigate();
  const [authStep, setAuthStep] = useState<'welcome' | 'signup' | 'login'>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const showAppleSignIn = isDespiaIOS();
  const authFlowBusy = authBusy || appleBusy;

  useEffect(() => {
    if (!showAppleSignIn) return;
    void loadAppleAuthSdk().catch(() => {
      // Button tap will surface load errors if preload fails.
    });
  }, [showAppleSignIn]);

  const canSubmit = email.trim().length > 3 && password.length >= 6;

  const navigateAfterAuth = async (mode: 'login' | 'signup') => {
    if (mode === 'signup') {
      navigate('/onboarding', { replace: true });
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
  };

  const handleAppleSignIn = async () => {
    setAuthError(null);
    setAppleBusy(true);
    let keepBusy = false;
    try {
      const result = await signInWithApple();
      if (result.cancelled) return;
      if (result.redirecting) {
        keepBusy = true;
        return;
      }
      if (result.error) {
        setAuthError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      await navigateAfterAuth('login');
    } finally {
      if (!keepBusy) setAppleBusy(false);
    }
  };

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setAuthBusy(true);

    if (authStep === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setAuthBusy(false);
      if (error) {
        setAuthError(error.message);
        return;
      }
      await navigateAfterAuth('login');
      return;
    }

    if (authStep === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      setAuthBusy(false);

      if (error) {
        setAuthError(error.message);
        return;
      }

      if (!data.session) {
        setAuthError('Check your email to confirm your account, then sign in.');
        return;
      }

      await navigateAfterAuth('signup');
    }
  };

  if (authStep === 'welcome') {
    return (
      <WelcomeScreen
        onGetStarted={() => {
          setAuthStep('signup');
          setAuthError(null);
        }}
        onLogIn={() => {
          setAuthStep('login');
          setAuthError(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-app bg-background text-foreground">
      {appleBusy ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
          <Loader2 className="h-8 w-8 animate-spin text-lime-400" aria-hidden />
          <p className="text-sm text-white/80">Connecting to Apple…</p>
        </div>
      ) : null}
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10 pt-4">
        <header className="mb-6 flex flex-col items-center gap-2 pt-6">
          <RNKXLogo size="md" />
          <p className="text-center text-sm text-muted-foreground">Train. Compete. Rank.</p>
        </header>

        {authError && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {authError}
          </p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex w-full flex-col gap-4"
        >
          <div className="flex rounded-lg border border-border bg-card p-1">
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-sm font-medium ${
                authStep === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
              onClick={() => {
                setAuthStep('login');
                setAuthError(null);
              }}
            >
              Log in
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-sm font-medium ${
                authStep === 'signup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
              onClick={() => {
                setAuthStep('signup');
                setAuthError(null);
              }}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-card"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete={authStep === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 bg-card"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" disabled={authFlowBusy || !canSubmit} className="h-12 w-full font-semibold">
              {authBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Please wait
                </>
              ) : authStep === 'login' ? (
                'Log in'
              ) : (
                'Sign up'
              )}
            </Button>
          </form>

          {showAppleSignIn ? (
            <>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <AppleSignInButton
                mode={authStep === 'signup' ? 'signup' : 'login'}
                disabled={authFlowBusy}
                onClick={() => void handleAppleSignIn()}
              />
            </>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
