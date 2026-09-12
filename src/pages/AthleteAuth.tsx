import { motion } from 'framer-motion';
import { FormEvent, useEffect, useState } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { WelcomeScreen } from '@/components/onboarding/WelcomeScreen';
import RNKXLogo from '@/components/RNKXLogo';
import { AppleSignInButton } from '@/components/auth/AppleSignInButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sendPasswordResetEmail } from '@/lib/authRedirect';
import { isDespiaIOS, loadAppleAuthSdk, signInWithApple } from '@/lib/appleSignIn';
import { getPendingLeagueInvitePath } from '@/lib/shareLeagueInvite';
import { useProfileGate } from '@/context/ProfileGateContext';
import { supabase } from '@/services/supabase';

type AuthStep = 'welcome' | 'signup' | 'login' | 'forgot';

type AthleteAuthProps = {
  passwordRecovery?: boolean;
  onRecoveryComplete?: () => void;
};

export default function AthleteAuth({ passwordRecovery = false, onRecoveryComplete }: AthleteAuthProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refetchProfile } = useProfileGate();
  const [authStep, setAuthStep] = useState<AuthStep>(() => {
    if (passwordRecovery) return 'login';
    const step = (location.state as { authStep?: string } | null)?.authStep;
    return step === 'login' ? 'login' : step === 'signup' ? 'signup' : 'welcome';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const showAppleSignIn = isDespiaIOS() && !passwordRecovery;
  const authFlowBusy = authBusy || appleBusy;

  useEffect(() => {
    if (!showAppleSignIn) return;
    void loadAppleAuthSdk().catch(() => {
      // Button tap will surface load errors if preload fails.
    });
  }, [showAppleSignIn]);

  useEffect(() => {
    if ((location.state as { authStep?: string } | null)?.authStep) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // Clear one-time navigation state only on first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmitLoginOrSignup = email.trim().length > 3 && password.length >= 6;
  const canSubmitForgot = email.trim().length > 3;
  const canSubmitNewPassword = password.length >= 6 && password === confirmPassword;

  const navigateAfterAuth = async (mode: 'login' | 'signup') => {
    const complete = await refetchProfile();
    if (mode === 'signup' || !complete) {
      navigate('/onboarding', { replace: true });
      return;
    }
    navigate(getPendingLeagueInvitePath() ?? '/app', { replace: true });
  };

  const handleAppleSignIn = async () => {
    setAuthError(null);
    setAppleBusy(true);
    try {
      const result = await signInWithApple();
      if (result.cancelled) return;
      if (result.error) {
        setAuthError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      await navigateAfterAuth('login');
    } finally {
      setAppleBusy(false);
    }
  };

  const handleSetNewPassword = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setPassword('');
    setConfirmPassword('');
    setPasswordUpdated(true);
  };

  const handleForgotSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    const { error } = await sendPasswordResetEmail(email);
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    toast.success('Check your email for a password reset link.');
    setAuthStep('login');
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

  if (passwordRecovery) {
    return (
      <div className="min-h-app bg-background text-foreground">
        <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10 pt-4">
          <header className="mb-6 flex flex-col items-center gap-2 pt-8">
            <RNKXLogo size="md" />
            <p className="text-center text-sm text-muted-foreground">
              {passwordUpdated ? 'Password updated' : 'Set a new password'}
            </p>
          </header>

          {passwordUpdated ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You can close this page and log in on the RNKX app with your new password.
              </p>
              <Button
                type="button"
                className="h-12 w-full font-semibold"
                onClick={() => {
                  void (async () => {
                    await supabase.auth.signOut();
                    onRecoveryComplete?.();
                    navigate('/auth', { replace: true, state: { authStep: 'login' } });
                  })();
                }}
              >
                Log in here
              </Button>
            </div>
          ) : (
            <>
              {authError && (
                <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {authError}
                </p>
              )}

              <form onSubmit={(e) => void handleSetNewPassword(e)} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground" htmlFor="new-password">
                    New password
                  </label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 bg-card"
                    minLength={6}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground" htmlFor="confirm-password">
                    Confirm password
                  </label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-12 bg-card"
                    minLength={6}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={authBusy || !canSubmitNewPassword}
                  className="h-12 w-full font-semibold"
                >
                  {authBusy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    'Update password'
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    );
  }

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
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10 pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2 w-fit gap-2 self-start"
          onClick={() => {
            setAuthStep(authStep === 'forgot' ? 'login' : 'welcome');
            setAuthError(null);
          }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>

        <header className="mb-6 flex flex-col items-center gap-2 pt-2">
          <RNKXLogo size="md" />
          <p className="text-center text-sm text-muted-foreground">
            {authStep === 'forgot' ? 'Reset your password' : 'Train. Compete. Rank.'}
          </p>
        </header>

        {authError && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {authError}
          </p>
        )}

        {authStep === 'forgot' ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full flex-col gap-4"
          >
            <p className="text-sm text-muted-foreground">
              We&apos;ll email a reset link. Open it on this device, then set a new password.
            </p>
            <form onSubmit={(e) => void handleForgotSubmit(e)} className="space-y-4">
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
              <Button type="submit" disabled={authBusy || !canSubmitForgot} className="h-12 w-full font-semibold">
                {authBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending
                  </>
                ) : (
                  'Send reset link'
                )}
              </Button>
            </form>
          </motion.div>
        ) : (
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

            <form onSubmit={(e) => void handleAuthSubmit(e)} className="space-y-4">
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
              {authStep === 'login' ? (
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => {
                    setAuthStep('forgot');
                    setAuthError(null);
                    setPassword('');
                  }}
                >
                  Forgot password?
                </button>
              ) : null}
              <Button
                type="submit"
                disabled={authFlowBusy || !canSubmitLoginOrSignup}
                className="h-12 w-full font-semibold"
              >
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
        )}
      </div>
    </div>
  );
}
