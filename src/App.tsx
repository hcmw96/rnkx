import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import { ProfileGateContext } from '@/context/ProfileGateContext';
import { NotificationCountProvider } from '@/context/NotificationCountContext';
import { AchievementUnlockProvider } from '@/context/AchievementUnlockContext';
import { ScoreSharePromptProvider } from '@/context/ScoreSharePromptContext';
import { AppLayout } from '@/components/app/AppLayout';
import { RequireAuth } from '@/components/app/RequireAuth';
import { SHOW_RECOVERY } from '@/lib/featureFlags';
import { clearRouteCaches } from '@/lib/routeCaches';
import { clearPremiumCache } from '@/lib/premiumCache';
import { clearAthleteIdCache, peekCachedHasSeenWelcome, resolveAthleteId } from '@/lib/resolveAthleteId';
import { AthleteSessionProvider } from '@/context/AthleteSessionContext';
import { NotificationNavigationBridge } from '@/components/NotificationNavigationBridge';
import { isDespiaNative, registerPushForAthlete } from './services/onesignal';
import {
  applyPremiumIfStoreHasEntitlement,
  pollCheckEntitlementUntilPremium,
  syncEntitlementFromServer,
} from './services/revenuecat';
import {
  clearPasswordRecovery,
  hasPasswordRecoveryFlag,
  markPasswordRecovery,
  urlIndicatesPasswordRecovery,
} from '@/lib/authRedirect';
import { supabase } from './services/supabase';

const AdminPage = lazy(() => import('./pages/app/AdminPage'));
const ChatThread = lazy(() => import('./app/ChatThread'));
const GroupChatThread = lazy(() => import('./app/GroupChatThread'));
const SettingsPage = lazy(() => import('./pages/app/SettingsPage'));
const FaqPage = lazy(() => import('./pages/app/FaqPage'));
const PremiumPage = lazy(() => import('./pages/app/PremiumPage'));
const LeaguePage = lazy(() => import('./pages/app/LeaguePage'));
const FriendProfilePage = lazy(() => import('./pages/app/FriendProfilePage'));
const ChatPage = lazy(() => import('./app/ChatPage'));
const JoinLeaguePage = lazy(() => import('./pages/JoinLeaguePage'));
const AthleteAuth = lazy(() => import('./pages/AthleteAuth'));
const WhoopCallback = lazy(() => import('./pages/auth/WhoopCallback'));
const AppleAuthComplete = lazy(() => import('./pages/auth/AppleAuthComplete'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const NotificationsPage = lazy(() => import('./pages/app/NotificationsPage'));
const WelcomeModal = lazy(() =>
  import('@/components/WelcomeModal').then((m) => ({ default: m.WelcomeModal })),
);
const PrivacyPolicyPageRoute = lazy(() =>
  import('./pages/legal/StaticLegalPages').then((m) => ({ default: m.PrivacyPolicyPageRoute })),
);
const TermsPageRoute = lazy(() =>
  import('./pages/legal/StaticLegalPages').then((m) => ({ default: m.TermsPageRoute })),
);
const WaiverPageRoute = lazy(() =>
  import('./pages/legal/StaticLegalPages').then((m) => ({ default: m.WaiverPageRoute })),
);
const CookiesPageRoute = lazy(() =>
  import('./pages/legal/StaticLegalPages').then((m) => ({ default: m.CookiesPageRoute })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function isAppleAuthCompletePath(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === '/auth/apple/complete';
}

function SessionRoutes() {
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState(() => isAppleAuthCompletePath());
  const [session, setSession] = useState<Session | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [welcomeAthleteId, setWelcomeAthleteId] = useState<string | null>(null);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(
    () => urlIndicatesPasswordRecovery() || hasPasswordRecoveryFlag(),
  );

  useEffect(() => {
    const syncFromUrl = () => {
      if (urlIndicatesPasswordRecovery()) {
        markPasswordRecovery();
        setPasswordRecovery(true);
      }
    };
    syncFromUrl();
    window.addEventListener('hashchange', syncFromUrl);
    return () => window.removeEventListener('hashchange', syncFromUrl);
  }, []);

  const refetchProfile = useCallback(async (): Promise<boolean> => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    if (!s?.user) {
      setProfileComplete(false);
      setSession(null);
      return false;
    }
    const ok = !!(await resolveAthleteId(s.user.id));
    setSession(s);
    setProfileComplete(ok);
    return ok;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function applySession(s: Session | null) {
      try {
        if (!s?.user) {
          if (!cancelled) {
            clearAthleteIdCache();
            clearPremiumCache();
            clearRouteCaches();
            setSession(null);
            setProfileComplete(false);
          }
          return;
        }
        const ok = !!(await resolveAthleteId(s.user.id));
        if (!cancelled) {
          setSession(s);
          setProfileComplete(ok);
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
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || urlIndicatesPasswordRecovery()) {
        markPasswordRecovery();
        setPasswordRecovery(true);
      }
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
      const athleteId = await resolveAthleteId(uid);
      if (cancelled) return;

      if (!athleteId) {
        setWelcomeAthleteId(null);
        setShowWelcomeOverlay(false);
        return;
      }

      setWelcomeAthleteId(athleteId);
      setShowWelcomeOverlay(peekCachedHasSeenWelcome(uid) !== true);
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
    if (!session?.user?.id || !profileComplete || passwordRecovery) {
      window.iapSuccess = undefined;
      window.onRevenueCatPurchase = undefined;
      return;
    }

    const onIapSuccess = async () => {
      const isPremium = await pollCheckEntitlementUntilPremium();
      if (isPremium) {
        toast.success('Premium unlocked!');
        navigate('/app', { replace: true });
      }
    };

    window.iapSuccess = () => {
      void onIapSuccess();
    };
    // Despia may also invoke the legacy RevenueCat purchase callback.
    window.onRevenueCatPurchase = () => {
      void onIapSuccess();
    };

    // Once per signed-in session (not per navigation): store can only grant;
    // check-entitlement (UUID-first, email fallback) is what clears expired premium.
    // syncEntitlementFromServer leaves the premium cache untouched on error so
    // offline / server failures do not revoke access; PremiumGate keeps showing
    // the warm/DB cache while the request is in flight (no paywall flash).
    void (async () => {
      await applyPremiumIfStoreHasEntitlement();
      await syncEntitlementFromServer();
    })();

    return () => {
      window.iapSuccess = undefined;
      window.onRevenueCatPurchase = undefined;
    };
  }, [session?.user?.id, profileComplete, navigate, passwordRecovery]);

  if (!initialized) {
    return <div className="min-h-screen bg-black" aria-hidden />;
  }

  const showApp = !!session && profileComplete && !passwordRecovery;
  const authShell = (
    <RequireAuth session={session} profileComplete={profileComplete}>
      <AppLayout />
    </RequireAuth>
  );

  return (
    <ProfileGateContext.Provider value={{ refetchProfile }}>
      <AthleteSessionProvider authUserId={session?.user?.id}>
      <ScoreSharePromptProvider authUserId={session?.user?.id} enabled={showApp}>
      <NotificationCountProvider enabled={showApp}>
      <AchievementUnlockProvider authUserId={session?.user?.id} enabled={showApp}>
      <NotificationNavigationBridge enabled={showApp} />
      {welcomeAthleteId && showWelcomeOverlay && !passwordRecovery ? (
        <Suspense fallback={null}>
          <WelcomeModal
            athleteId={welcomeAthleteId}
            onDismiss={() => setShowWelcomeOverlay(false)}
          />
        </Suspense>
      ) : null}
      <Suspense fallback={<div className="min-h-screen bg-black" aria-hidden />}>
      <Routes>
        <Route path="/privacy" element={<PrivacyPolicyPageRoute />} />
        <Route path="/terms" element={<TermsPageRoute />} />
        <Route path="/waiver" element={<WaiverPageRoute />} />
        <Route path="/cookies" element={<CookiesPageRoute />} />
        <Route path="/auth/whoop/callback" element={<WhoopCallback />} />
        <Route path="/auth/apple/complete" element={<AppleAuthComplete />} />
        <Route path="/whoop-callback" element={<WhoopCallback />} />
        <Route path="/app/whoop-callback" element={<WhoopCallback />} />
        <Route path="/join/:code" element={<JoinLeaguePage />} />
        <Route path="/premium" element={<PremiumPage />} />
        <Route
          path="/auth"
          element={
            passwordRecovery ? (
              <AthleteAuth
                passwordRecovery
                onRecoveryComplete={() => {
                  clearPasswordRecovery();
                  setPasswordRecovery(false);
                }}
              />
            ) : session ? (
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
          element={authShell}
        >
          <Route index element={null} />
          <Route path="leaderboard" element={null} />
          <Route path="profile" element={null} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="faq" element={<FaqPage />} />
          <Route path="social">
            <Route index element={null} />
            <Route path="friends" element={null} />
            <Route path="leagues" element={null} />
            <Route path="discover" element={null} />
            <Route
              path="recovery"
              element={
                <Navigate to={SHOW_RECOVERY ? '/app/settings#recovery' : '/app/settings'} replace />
              }
            />
          </Route>
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="friends/:athleteId" element={<FriendProfilePage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="leagues/:leagueId" element={<LeaguePage />} />
        </Route>
        <Route path="/app/friends" element={<Navigate to="/app/social/friends" replace />} />
        <Route
          path="/app/chat/group/:conversationId"
          element={
            <RequireAuth session={session} profileComplete={profileComplete}>
              <GroupChatThread />
            </RequireAuth>
          }
        />
        <Route
          path="/app/chat/:friendId"
          element={
            <RequireAuth session={session} profileComplete={profileComplete}>
              <ChatThread />
            </RequireAuth>
          }
        />
        <Route path="/app/leagues" element={<Navigate to="/app/social/leagues" replace />} />
        <Route
          path="/app/recovery"
          element={<Navigate to={SHOW_RECOVERY ? '/app/settings#recovery' : '/app/settings'} replace />}
        />
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
      </Suspense>
      </AchievementUnlockProvider>
      </NotificationCountProvider>
      </ScoreSharePromptProvider>
      </AthleteSessionProvider>
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
