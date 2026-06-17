import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { ProfileGateContext } from '@/context/ProfileGateContext';
import { NotificationCountProvider } from '@/context/NotificationCountContext';
import { AchievementUnlockProvider } from '@/context/AchievementUnlockContext';
import { ScoreSharePromptProvider } from '@/context/ScoreSharePromptContext';
import { SHOW_RECOVERY } from '@/lib/featureFlags';
import LeaderboardPage from './pages/app/LeaderboardPage';
import ProfilePage from './pages/app/ProfilePage';
import SettingsPage from './pages/app/SettingsPage';
import FaqPage from './pages/app/FaqPage';
import PremiumPage from './pages/app/PremiumPage';
import AdminPage from './pages/app/AdminPage';
import PrivateLeaguesPage from './pages/app/PrivateLeaguesPage';
import DiscoverClubsPage from './pages/app/DiscoverClubsPage';
import LeaguePage from './pages/app/LeaguePage';
import FriendsPage from './pages/app/FriendsPage';
import FriendProfilePage from './pages/app/FriendProfilePage';
import SocialPage from './pages/app/SocialPage';
import ChatPage from './app/ChatPage';
import ChatThread from './app/ChatThread';
import GroupChatThread from './app/GroupChatThread';
import Dashboard from './pages/app/Dashboard';
import JoinLeaguePage from './pages/JoinLeaguePage';
import AthleteAuth from './pages/AthleteAuth';
import WhoopCallback from './pages/auth/WhoopCallback';
import Onboarding from './pages/Onboarding';
import NotificationsPage from './pages/app/NotificationsPage';
import { NotificationNavigationBridge } from '@/components/NotificationNavigationBridge';
import {
  CookiesPageRoute,
  PrivacyPolicyPageRoute,
  TermsPageRoute,
  WaiverPageRoute,
} from './pages/legal/StaticLegalPages';
import { WelcomeModal } from '@/components/WelcomeModal';
import { isDespiaNative, registerPushForAthlete } from './services/onesignal';
import { resolveAthleteId } from './lib/resolveAthleteId';
import { applyPremiumIfStoreHasEntitlement } from './services/revenuecat';
import { supabase } from './services/supabase';

const queryClient = new QueryClient();

async function fetchAthleteProfileComplete(userId: string): Promise<boolean> {
  const [byUserId, byId] = await Promise.all([
    supabase.from('athletes').select('id').eq('user_id', userId).not('username', 'is', null).maybeSingle(),
    supabase.from('athletes').select('id').eq('id', userId).not('username', 'is', null).maybeSingle(),
  ]);

  if (byUserId.error && byId.error) return false;
  return !!(byUserId.data?.id ?? byId.data?.id);
}

function SessionRoutes() {
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [welcomeAthleteId, setWelcomeAthleteId] = useState<string | null>(null);
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

    const initFailsafe = window.setTimeout(() => {
      if (!cancelled) setInitialized(true);
    }, 10_000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      // Defer async Supabase calls — running them synchronously in this handler can deadlock getSession().
      window.setTimeout(() => {
        if (!cancelled) void applySession(newSession);
      }, 0);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(initFailsafe);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id || !profileComplete) {
      setWelcomeAthleteId(null);
      setShowWelcomeOverlay(false);
      return;
    }
    const uid = session.user.id;

    let cancelled = false;
    void (async () => {
      const [byUserId, byId] = await Promise.all([
        supabase
          .from('athletes')
          .select('id, has_seen_welcome')
          .eq('user_id', uid)
          .not('username', 'is', null)
          .maybeSingle(),
        supabase
          .from('athletes')
          .select('id, has_seen_welcome')
          .eq('id', uid)
          .not('username', 'is', null)
          .maybeSingle(),
      ]);

      type Row = {
        id: string;
        has_seen_welcome: boolean | null;
      };

      const row = (byUserId.data as Row | null) ?? (byId.data as Row | null);
      if (cancelled) return;

      if (!row?.id) {
        setWelcomeAthleteId(null);
        setShowWelcomeOverlay(false);
        return;
      }

      setWelcomeAthleteId(row.id);
      setShowWelcomeOverlay(row.has_seen_welcome !== true);
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, profileComplete]);

  useEffect(() => {
    if (!session?.user?.id || !profileComplete) return;

    const uid = session.user.id;
    void (async () => {
      const athleteId = await resolveAthleteId(uid);
      if (!athleteId) return;

      try {
        await registerPushForAthlete(athleteId);
      } catch (err) {
        console.warn('[OneSignal] register push failed', err);
      }
    })();
  }, [session?.user?.id, profileComplete]);

  useEffect(() => {
    if (!session?.user?.id || !profileComplete || !isDespiaNative()) return;

    const uid = session.user.id;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        const athleteId = await resolveAthleteId(uid);
        if (!athleteId) return;
        try {
          await registerPushForAthlete(athleteId);
        } catch (err) {
          console.warn('[OneSignal] foreground re-link failed', err);
        }
      })();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [session?.user?.id, profileComplete]);

  useEffect(() => {
    if (!session?.user?.id || !profileComplete) {
      window.onRevenueCatPurchase = undefined;
      return;
    }

    window.onRevenueCatPurchase = async () => {
      const isPremium = await applyPremiumIfStoreHasEntitlement();
      if (isPremium) {
        toast.success('Premium unlocked! 🎉');
      }
    };

    void (async () => {
      await applyPremiumIfStoreHasEntitlement();
    })();

    return () => {
      window.onRevenueCatPurchase = undefined;
    };
  }, [session?.user?.id, profileComplete]);

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="Loading session" />
      </div>
    );
  }

  const showApp = !!session && profileComplete;

  return (
    <ProfileGateContext.Provider value={{ refetchProfile }}>
      <ScoreSharePromptProvider authUserId={session?.user?.id} enabled={showApp}>
      <NotificationCountProvider enabled={showApp}>
      <AchievementUnlockProvider authUserId={session?.user?.id} enabled={showApp}>
      <NotificationNavigationBridge enabled={showApp} />
      {welcomeAthleteId && showWelcomeOverlay ? (
        <WelcomeModal
          athleteId={welcomeAthleteId}
          onDismiss={() => setShowWelcomeOverlay(false)}
        />
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
          path="/admin"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <AdminPage />
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
          path="/app/settings"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <SettingsPage />
            )
          }
        />
        <Route
          path="/app/faq"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <FaqPage />
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
          <Route path="discover" element={<DiscoverClubsPage />} />
          <Route path="recovery" element={<Navigate to={SHOW_RECOVERY ? '/app/settings#recovery' : '/app/settings'} replace />} />
        </Route>
        <Route path="/app/friends" element={<Navigate to="/app/social/friends" replace />} />
        <Route
          path="/app/notifications"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <NotificationsPage />
            )
          }
        />
        <Route
          path="/app/friends/:athleteId"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <FriendProfilePage />
            )
          }
        />
        <Route
          path="/app/chat"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <ChatPage />
            )
          }
        />
        <Route
          path="/app/chat/group/:conversationId"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <GroupChatThread />
            )
          }
        />
        <Route
          path="/app/chat/:friendId"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profileComplete ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <ChatThread />
            )
          }
        />
        <Route path="/app/leagues" element={<Navigate to="/app/social/leagues" replace />} />
        <Route path="/app/recovery" element={<Navigate to={SHOW_RECOVERY ? '/app/settings#recovery' : '/app/settings'} replace />} />
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
      </AchievementUnlockProvider>
      </NotificationCountProvider>
      </ScoreSharePromptProvider>
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
