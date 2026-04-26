import { motion } from 'framer-motion';
import { FormEvent, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/services/supabase';

export default function AthleteAuth() {
  const navigate = useNavigate();
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length >= 6;

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setAuthBusy(true);

    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setAuthBusy(false);
      if (error) {
        setAuthError(error.message);
        return;
      }
      navigate('/app', { replace: true });
      return;
    }

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

    navigate('/onboarding', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 pb-10 pt-8">
        <header className="mb-6 flex flex-col items-center gap-2 pt-6">
          <h1 className="font-display text-4xl tracking-wide text-primary">RNKX</h1>
          <p className="text-center text-sm text-muted-foreground">Train. Compete. Rise.</p>
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
                authMode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
              }}
            >
              Log in
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md py-2 text-sm font-medium ${
                authMode === 'signup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
              onClick={() => {
                setAuthMode('signup');
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
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 bg-card"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" disabled={authBusy || !canSubmit} className="h-12 w-full font-semibold">
              {authBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Please wait
                </>
              ) : authMode === 'login' ? (
                'Log in'
              ) : (
                'Sign up'
              )}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
