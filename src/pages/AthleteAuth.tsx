import { motion } from 'framer-motion';
import { FormEvent, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/services/supabase';
import rnkxLogo from '@/assets/rnkx-logo.svg';

const HERO_VIDEO_URL =
  'https://jcaqvkubijqjmqcmsgln.supabase.co/storage/v1/object/public/public-assets/videos/hero-bg.mp4';

/** Dark 1×1 SVG as poster until the first frame / full video is ready. */
const HERO_VIDEO_POSTER =
  'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="%23050505"/></svg>');

const MOCK_LEADERBOARD = [
  { rank: 1, flag: '🇺🇸', name: 'SarahK…', score: '12,450' },
  { rank: 2, flag: '🇬🇧', name: 'TomRuns…', score: '11,892' },
  { rank: 3, flag: '🇩🇪', name: 'AlexM…', score: '10,201' },
  { rank: 4, flag: '🇯🇵', name: 'Yuki…', score: '9,840' },
  { rank: 5, flag: '🇦🇺', name: 'ChrisL…', score: '9,112' },
] as const;

/** WebView-specific playsinline flags (DOM attribute names with hyphens). */
const VIDEO_WEBVIEW_PROPS = {
  'webkit-playsinline': 'true',
  'x5-playsinline': 'true',
} as const;

export default function AthleteAuth() {
  const navigate = useNavigate();
  const [authStep, setAuthStep] = useState<'welcome' | 'signup' | 'login'>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length >= 6;

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
      navigate('/app', { replace: true });
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

      navigate('/onboarding', { replace: true });
    }
  };

  if (authStep === 'welcome') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#050505] text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[#050505]" aria-hidden />
        <video
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={HERO_VIDEO_POSTER}
          src={HERO_VIDEO_URL}
          aria-hidden
          {...VIDEO_WEBVIEW_PROPS}
        />
        <div className="absolute inset-0 bg-black/50" aria-hidden />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 text-center sm:gap-5">
            <div className="flex items-center justify-center">
              <img src={rnkxLogo} alt="RNKX" className="h-9 w-auto shrink-0 sm:h-11" />
            </div>

            <h1 className="font-display text-[clamp(1.75rem,6vw,2.75rem)] leading-tight text-white">
              Train with purpose
            </h1>

            <p className="max-w-md text-sm text-white sm:text-base">
              Turning everyday training into competition
            </p>

            <p className="max-w-lg text-sm text-white sm:text-base">
              Your real training data{' '}
              <span className="font-bold text-neon-lime">Measured. Ranked</span>
            </p>

            <p className="text-sm text-white/70 sm:text-base">Compete with friends. Climb leagues</p>

            <p className="text-sm text-white/70 sm:text-base">Build momentum</p>

            <div className="mt-2 grid w-full max-w-xl grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4">
              <div className="rounded-xl border border-white/10 bg-black/45 p-3 text-left shadow-lg backdrop-blur-sm sm:p-4">
                <p className="font-display text-[10px] uppercase tracking-wider text-white/50 sm:text-xs">
                  Run league
                </p>
                <p className="font-display text-sm text-neon-lime sm:text-base">Season 1</p>
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                  {MOCK_LEADERBOARD.map((row) => (
                    <div
                      key={row.rank}
                      className="grid grid-cols-[1.25rem_1.25rem_1fr_auto] items-center gap-2 text-xs sm:text-sm"
                    >
                      <span className="text-white/60">{row.rank}</span>
                      <span className="text-base leading-none">{row.flag}</span>
                      <span className="truncate text-white/90">{row.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-electric-cyan">{row.score}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/45 p-3 text-left shadow-lg backdrop-blur-sm sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 font-display text-lg text-white">
                    JR
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">JakeRunner</p>
                    <p className="text-xs text-white/60 sm:text-sm">Open League</p>
                  </div>
                </div>
                <dl className="mt-4 space-y-2 border-t border-white/10 pt-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-white/55">Rank</dt>
                    <dd className="font-semibold text-white">1</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-white/55">Points</dt>
                    <dd className="font-semibold tabular-nums text-white">2,847</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-white/55">Weekly Momentum</dt>
                    <dd className="font-semibold text-neon-lime">↑ 4 places</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-black/60 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-md sm:px-6">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
            <Button
              type="button"
              onClick={() => {
                setAuthStep('signup');
                setAuthError(null);
              }}
              className="h-12 w-full rounded-lg bg-neon-lime font-display text-lg tracking-wide text-black shadow-[0_0_24px_hsl(72_100%_50%/0.35)] hover:bg-neon-lime/90"
            >
              Create Profile →
            </Button>
            <button
              type="button"
              className="text-center text-sm text-white/65 underline-offset-4 hover:text-white/85 hover:underline"
              onClick={() => {
                setAuthStep('login');
                setAuthError(null);
              }}
            >
              Already have an account? Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            <Button type="submit" disabled={authBusy || !canSubmit} className="h-12 w-full font-semibold">
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
        </motion.div>
      </div>
    </div>
  );
}
