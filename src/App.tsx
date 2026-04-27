import { useCallback, useEffect, useRef, useState } from 'react';
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
import { buildSyncActivitiesAppleBody } from './lib/syncActivitiesApple';
import { fetchRecentWorkouts } from './services/despia';
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
  const backgroundAppleSyncForUser = useRef<string | null>(null);

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
      setSession(s);
      if (s?.user) {
        const ok = await fetchAthleteProfileComplete(s.user.id);
        if (!cancelled) setProfileComplete(ok);
      } else if (!cancelled) {
        setProfileComplete(false);
      }
      if (!cancelled) setInitialized(true);
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      void applySession(data.session);
    });

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
    if (!session?.user) {
      backgroundAppleSyncForUser.current = null;
      return;
    }
    if (!profileComplete) return;

    const uid = session.user.id;
    if (backgroundAppleSyncForUser.current === uid) return;
    backgroundAppleSyncForUser.current = uid;

    void (async () => {
      const syncData = await fetchRecentWorkouts();
      if (syncData.error || syncData.workouts.length === 0) return;

      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) return;

      await supabase.functions.invoke('sync-activities', {
        body: buildSyncActivitiesAppleBody(syncData.workouts),
        headers: { Authorization: `Bearer ${token}` },
      });
    })();
  }, [session?.user?.id, profileComplete]);

  useEffect(() => {
    if (!session?.user || !profileComplete) return;

    const uid = session.user.id;
    void (async () => {
      const [byUserId, byId] = await Promise.all([
        supabase.from('athletes').select('id').eq('user_id', uid).not('username', 'is', null).maybeSingle(),
        supabase.from('athletes').select('id').eq('id', uid).not('username', 'is', null).maybeSingle(),
      ]);
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
      <Routes>
        <Route path="/auth/whoop/callback" element={<WhoopCallback />} />
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
