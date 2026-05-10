import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';
import { ProfileGateContext } from '@/context/ProfileGateContext';
import LeaderboardPage from './pages/app/LeaderboardPage';
import ProfilePage from './pages/app/ProfilePage';
import PremiumPage from './pages/app/PremiumPage';
import PrivateLeaguesPage from './pages/app/PrivateLeaguesPage';
import LeaguePage from './pages/app/LeaguePage';
import FriendsPage from './pages/app/FriendsPage';
import SocialPage from './pages/app/SocialPage';
import RecoveryPage from './pages/app/RecoveryPage';
import Dashboard from './pages/app/Dashboard';
import JoinLeaguePage from './pages/JoinLeaguePage';
import AthleteAuth from './pages/AthleteAuth';
import WhoopCallback from './pages/auth/WhoopCallback';
import Onboarding from './pages/Onboarding';
import HowItWorksPage from './pages/app/HowItWorksPage';
import {
  CookiesPageRoute,
  PrivacyPolicyPageRoute,
  TermsPageRoute,
  WaiverPageRoute,
} from './pages/legal/StaticLegalPages';
import { WelcomeModal, RNKX_WELCOME_SEEN_KEY } from '@/components/WelcomeModal';
import { setOneSignalExternalId } from './services/onesignal';
import { supabase } from './services/supabase';

const queryClient = new QueryClient();

async function fetchAthleteProfileComplete(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('athletes')
    .select('id')
    .eq('user_id', userId)
    .not('username', 'is', null)
    .maybeSingle();

  if (error) return false;
  return !!data;
}

function SessionRoutes() {
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [welcomeUsername, setWelcomeUsername] = useState<string | null>(null);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);

  const refetchProfile = useCallback(async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    if (!s?.user) {
      setProfileComplete(false);
      return;
    }
    const ok = await fetchAthleteProfileComplete(s.user.id);
    setProfileComplete(ok);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function applySession(s: Session | null) {
      try {
        setSession(s);
        if (s?.user) {
          const ok = await fetchAthleteProfileComplete(s.user.id);
          if (!cancelled) setProfileComplete(ok);
        } else if (!cancelled) {
          setProfileComplete(false);
        }
      } catch (error) {
        console.error('applySession error:', error);
        if (!cancelled) {
          setSession(s ?? null);
          setProfileComplete(false);
        }
      }
    }

    void (async () => {
      try {
        const {
          data: { session: s },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        await applySession(s);
      } catch (error) {
        console.error('Session init error:', error);
      } finally {
        if (!cancelled) setInitialized(true);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      void applySession(newSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id || !profileComplete || typeof window === 'undefined') {
      setWelcomeUsername(null);
      setShowWelcomeOverlay(false);
      return;
    }
    const uid = session.user.id;
    const seenWelcome = window.localStorage.getItem(RNKX_WELCOME_SEEN_KEY) === 'true';
    setShowWelcomeOverlay(!seenWelcome);

    let cancelled = false;
    void (async () => {
      const [byUserId, byId] = await Promise.all([
        supabase.from('athletes').select('username').eq('user_id', uid).not('username', 'is', null).maybeSingle(),
        supabase.from('athletes').select('username').eq('id', uid).not('username', 'is', null).maybeSingle(),
      ]);
      const name =
        typeof byUserId.data?.username === 'string'
          ? byUserId.data.username
          : typeof byId.data?.username === 'string'
            ? byId.data.username
            : null;
      if (!cancelled) setWelcomeUsername(name);
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, profileComplete]);

  useEffect(() => {
    if (!session?.user || !profileComplete) return;

    const uid = session.user.id;
    void (async () => {
      const [byUserId, byId] = await Promise.all([
        supabase.from('athletes').select('id').eq('user_id', uid).not('username', 'is', null).maybeSingle(),
        supabase.from('athletes').select('id').eq('id', uid).not('username', 'is', null).maybeSingle(),
      ]);
      // athletes.id — same external_user_id server-side pushes must target
      const athleteId = (byUserId.data?.id ?? byId.data?.id) as string | undefined;
      if (!athleteId) return;

      try {
        await setOneSignalExternalId(athleteId);
      } catch (err) {
        console.warn('[OneSignal] set external id failed', err);
      }
    })();
  }, [session?.user?.id, profileComplete]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="Loading session" />
      </div>
    );
  }

  return (
    <ProfileGateContext.Provider value={{ refetchProfile }}>
      {welcomeUsername && showWelcomeOverlay ? (
        <WelcomeModal username={welcomeUsername} onDismiss={() => setShowWelcomeOverlay(false)} />
      ) : null}
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicyPageRoute />} />
        <Route path="/terms" element={<TermsPageRoute />} />
        <Route path="/waiver" element={<WaiverPageRoute />} />
        <Route path="/cookies" element={<CookiesPageRoute />} />
        <Route path="/auth/whoop/callback" element={<WhoopCallback />} />
        <Route path="/whoop-callback" element={<WhoopCallback />} />
        <Route path="/app/whoop-callback" element={<WhoopCallback />} />
        <Route path="/join/:code" element={<JoinLeaguePage />} />
        <Route path="/premium" element={<PremiumPage />} />
        <Route
          path="/auth"
          element={
            session ? (
              profileComplete ? (
                <Navigate to="/app" replace />
              ) : (
                <Navigate to="/onboarding" replace />
              )
            ) : (
              <AthleteAuth />
            )
          }
        />
        <Route
          path="/onboarding"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : profileComplete ? (
              <Navigate to="/app" replace />
            ) : (
              <Onboarding />
            )
          }
        />
        <Route
          path="/app"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <Dashboard />
            )
          }
        />
        <Route
          path="/app/leaderboard"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <LeaderboardPage />
            )
          }
        />
        <Route
          path="/app/profile"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <ProfilePage />
            )
          }
        />
        <Route
          path="/app/how-it-works"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <HowItWorksPage />
            )
          }
        />
        <Route
          path="/app/social"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <SocialPage />
            )
          }
        >
          <Route index element={<Navigate to="friends" replace />} />
          <Route path="friends" element={<FriendsPage embedded />} />
          <Route path="leagues" element={<PrivateLeaguesPage embedded />} />
          <Route path="recovery" element={<RecoveryPage embedded />} />
        </Route>
        <Route path="/app/friends" element={<Navigate to="/app/social/friends" replace />} />
        <Route path="/app/leagues" element={<Navigate to="/app/social/leagues" replace />} />
        <Route path="/app/recovery" element={<Navigate to="/app/social" replace />} />
        <Route
          path="/app/leagues/:leagueId"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <LeaguePage />
            )
          }
        />
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </ProfileGateContext.Provider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster richColors closeButton position="top-center" theme="dark" />
        <SessionRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
