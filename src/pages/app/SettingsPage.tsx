import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import despia from 'despia-native';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SHOW_RECOVERY } from '@/lib/featureFlags';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { SettingsPageLayout } from '@/components/settings/SettingsPageLayout';
import {
  CorosLogo,
  FitbitLogo,
  GarminLogo,
  OuraLogo,
  PolarLogo,
  SamsungLogo,
  StravaLogo,
  WhoopLogo,
} from '@/components/BrandLogos';
import { providerLabel } from '@/components/terra/TerraWearableProviders';
import { isDespiaIphoneUa } from '@/lib/despiaPlatform';
import {
  extractHealthkitWorkoutsArray,
  readHealthKitWorkouts,
  SYNC_INCLUDED_HR,
} from '@/lib/healthKitWorkoutRead';
import {
  isHealthKitBusy,
  releaseHealthKit,
  tryAcquireHealthKit,
  waitForHealthKitIdle,
} from '@/lib/healthKitSync';
import {
  inferMaxHrFromAppleWorkouts,
  nextProfileMaxHrFromApple,
  shouldApplyAppleMaxHrToProfile,
} from '@/lib/appleMaxHr';
import { useAchievementUnlock } from '@/context/AchievementUnlockContext';
import { useScoreSharePrompt } from '@/context/ScoreSharePromptContext';
import { syncAppleWorkoutsToDatabase } from '@/lib/syncActivitiesApple';
import { fetchRecentWorkouts } from '@/services/despia';
import { getScoringAssistantReply } from '@/lib/scoringAssistant';
import { presentPaywall, restoreInAppPurchasesAndApplyPremium } from '@/services/revenuecat';
import { supabase } from '@/services/supabase';

const ATHLETE_COLUMNS =
  'id,username,display_name,country,avatar_url,total_score,selected_leagues,wearables,user_id,max_hr,max_hr_source,is_premium,health_data_enabled,profile_public,last_synced';

interface AthleteRow {
  id: string;
  username: string | null;
  display_name: string;
  country: string | null;
  avatar_url: string | null;
  total_score: number | string | null;
  selected_leagues: string[] | null;
  wearables: string[] | null;
  user_id: string | null;
  max_hr: number | string | null;
  max_hr_source: string | null;
  is_premium: boolean | null;
  health_data_enabled: boolean | null;
  profile_public: boolean | null;
  last_synced: string | null;
}

type SettingsDialog =
  | 'email'
  | 'displayName'
  | 'username'
  | 'password'
  | 'leagues'
  | 'subscription'
  | 'support'
  | 'appleDevice'
  | 'whoopDevice'
  | 'terraDevice'
  | null;

interface TerraConnectionRow {
  id: string;
  terra_user_id: string;
  provider: string;
}

interface WhoopConnectionRow {
  id: string;
}

/** WHOOP OAuth (production callback registered in WHOOP dashboard); append `&state=…` before redirect. */
const WHOOP_OAUTH_AUTHORIZE_BASE =
  'https://api.prod.whoop.com/oauth/oauth2/auth?client_id=35885b30-f053-4b61-813b-e63702f1c83a' +
  '&redirect_uri=https://rnkx.netlify.app/auth/whoop/callback' +
  '&response_type=code' +
  '&scope=' +
  encodeURIComponent('read:workout read:recovery read:sleep read:profile read:body_measurement offline');

const WEARABLE_LOGO_BY_CODE: Record<string, ComponentType<{ className?: string }>> = {
  GARMIN: GarminLogo,
  POLAR: PolarLogo,
  COROS: CorosLogo,
  FITBIT: FitbitLogo,
  OURA: OuraLogo,
  SAMSUNG: SamsungLogo,
  STRAVA: StravaLogo,
  WHOOP: WhoopLogo,
};

function wearableLogoForCode(code: string) {
  return WEARABLE_LOGO_BY_CODE[code.toUpperCase()] ?? null;
}

function athleteWearsApple(wearables: string[] | null | undefined): boolean {
  return (wearables ?? []).some((w) => {
    const v = String(w).toLowerCase();
    return v === 'apple_watch' || v === 'apple';
  });
}

function athleteWearsWhoop(wearables: string[] | null | undefined): boolean {
  return (wearables ?? []).some((w) => String(w).toLowerCase() === 'whoop');
}

function parseMaxHrDisplay(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [athlete, setAthlete] = useState<AthleteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const [terraConnecting, setTerraConnecting] = useState(false);
  const [terraConnections, setTerraConnections] = useState<TerraConnectionRow[]>([]);
  const [whoopConnection, setWhoopConnection] = useState<WhoopConnectionRow | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [disconnectingWhoop, setDisconnectingWhoop] = useState(false);
  const [appleConnecting, setAppleConnecting] = useState(false);
  const [showHkSyncWarning, setShowHkSyncWarning] = useState(false);

  const HK_SYNC_WARNING_KEY = 'hasSeenHealthKitSyncWarning';
  /** Despia iPhone HealthKit probe: null until resolved; irrelevant when DB has no apple wearable. */
  const [appleHkLiveOk, setAppleHkLiveOk] = useState<boolean | null>(null);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [usernameDraft, setUsernameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [supportBody, setSupportBody] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [restorePurchasing, setRestorePurchasing] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountWorking, setDeleteAccountWorking] = useState(false);
  const [settingsDialog, setSettingsDialog] = useState<SettingsDialog>(null);
  const [terraDialogRow, setTerraDialogRow] = useState<TerraConnectionRow | null>(null);
  const { promptFromAppleSync } = useScoreSharePrompt();
  const { refreshAchievements } = useAchievementUnlock();

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      toast.error(authErr?.message ?? 'Not signed in.');
      setAthlete(null);
      setTerraConnections([]);
      setWhoopConnection(null);
      setAppleHkLiveOk(null);
      setUserEmail(null);
      setLoading(false);
      return;
    }

    setUserEmail(auth.user.email ?? null);
    const uid = auth.user.id;
    const [byUserId, byId] = await Promise.all([
      supabase.from('athletes').select(ATHLETE_COLUMNS).eq('user_id', uid).maybeSingle(),
      supabase.from('athletes').select(ATHLETE_COLUMNS).eq('id', uid).maybeSingle(),
    ]);

    const athleteRow = (byUserId.data as AthleteRow | null) ?? (byId.data as AthleteRow | null);
    if (!athleteRow) {
      const err = byUserId.error ?? byId.error;
      if (err) toast.error(err.message);
      setAthlete(null);
      setTerraConnections([]);
      setWhoopConnection(null);
      setAppleHkLiveOk(null);
      setAppleError(null);
    } else {
      await supabase.rpc('ensure_athlete_user_id', { p_athlete_id: athleteRow.id });

      const row = athleteRow as AthleteRow;
      setAthlete({
        ...row,
        is_premium: row.is_premium ?? false,
        health_data_enabled: row.health_data_enabled ?? true,
        profile_public: row.profile_public ?? true,
      });
      const [{ data: connRows, error: connErr }, whoopRes] = await Promise.all([
        supabase.from('terra_connections').select('id,terra_user_id,provider').eq('athlete_id', athleteRow.id),
        supabase.from('whoop_connections').select('id').eq('athlete_id', athleteRow.id).maybeSingle(),
      ]);
      if (connErr) {
        toast.error(connErr.message);
        setTerraConnections([]);
      } else {
        setTerraConnections((connRows ?? []) as TerraConnectionRow[]);
      }
      if (whoopRes.error) {
        setWhoopConnection(null);
      } else {
        setWhoopConnection((whoopRes.data as WhoopConnectionRow | null) ?? null);
      }
      setAppleError(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!SHOW_RECOVERY || !athlete || location.hash !== '#recovery') return;
    const el = document.getElementById('recovery');
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [athlete, location.hash]);

  const refreshWhoopConnection = useCallback(async () => {
    if (!athlete?.id) return;
    const { data, error } = await supabase
      .from('whoop_connections')
      .select('id')
      .eq('athlete_id', athlete.id)
      .maybeSingle();
    if (error) {
      setWhoopConnection(null);
      return;
    }
    setWhoopConnection((data as WhoopConnectionRow | null) ?? null);
  }, [athlete?.id]);

  useEffect(() => {
    if (!athlete?.id) return;

    void refreshWhoopConnection();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshWhoopConnection();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [athlete?.id, refreshWhoopConnection]);

  const athleteWearablesKey = useMemo(
    () => JSON.stringify(athlete?.wearables ?? []),
    [athlete?.wearables],
  );

  useEffect(() => {
    syncingRef.current = syncing;
  }, [syncing]);

  useEffect(() => {
    if (!athlete?.id) return;

    const wearablesSnapshot = athlete.wearables;

    if (!athleteWearsApple(wearablesSnapshot) || !isDespiaIphoneUa()) {
      return;
    }

    if (appleHkLiveOk === true) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled) return;

      if (syncingRef.current || isHealthKitBusy()) {
        return;
      }

      if (!tryAcquireHealthKit('probe')) {
        return;
      }

      try {
        const result = await readHealthKitWorkouts('probe');
        if (cancelled) return;
        const rawWorkouts = extractHealthkitWorkoutsArray(result);
        if (rawWorkouts.length >= 1) {
          setAppleHkLiveOk(true);
        } else {
          setAppleHkLiveOk(null);
        }
      } catch {
        if (cancelled) return;
        setAppleHkLiveOk(null);
      } finally {
        releaseHealthKit('probe');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [athlete?.id, athleteWearablesKey, appleHkLiveOk]);

  const handleSync = async () => {
    if (!athlete?.id) {
      toast.error('Missing athlete profile.');
      return;
    }

    const wearsApple = athleteWearsApple(athlete.wearables ?? null);
    const despiaIphone = isDespiaIphoneUa();

    setSyncing(true);
    try {
      if (wearsApple && despiaIphone) {
        const idle = await waitForHealthKitIdle(10_000);
        if (!idle) {
          toast.error('HealthKit is busy — wait a moment and try again');
          return;
        }

        toast.message('Sync: reading HealthKit...');

        let syncData: Awaited<ReturnType<typeof fetchRecentWorkouts>>;
        try {
          syncData = await fetchRecentWorkouts();
        } catch (err) {
          toast.error('Step 1 failed: ' + String(err));
          return;
        }
        if (syncData.error) {
          toast.error('fetchRecentWorkouts failed: ' + syncData.error);
          return;
        }

        const workouts = syncData.workouts;
        toast.message('HealthKit OK', { description: `${workouts.length} workouts found` });
        toast.message('Sync: uploading ' + workouts.length + ' workouts...');

        let processed = 0;
        let syncResults: Awaited<ReturnType<typeof syncAppleWorkoutsToDatabase>>['results'] = [];
        try {
          const rpcResult = await supabase.rpc('sync_apple_workouts', {
            p_athlete_id: athlete.id,
            p_workouts: workouts,
          });
          toast.message('RPC response', {
            description: JSON.stringify(rpcResult?.data ?? rpcResult?.error ?? 'no data').slice(0, 150),
          });
          if (rpcResult.error) {
            toast.error('Step 2 failed: ' + rpcResult.error.message);
            return;
          }
          const payload =
            rpcResult.data && typeof rpcResult.data === 'object'
              ? (rpcResult.data as Record<string, unknown>)
              : null;
          processed = payload && 'processed' in payload ? Number(payload.processed) || 0 : 0;
          const rawResults = payload?.results;
          syncResults = Array.isArray(rawResults)
            ? (rawResults as Awaited<ReturnType<typeof syncAppleWorkoutsToDatabase>>['results'])
            : [];

          if (shouldApplyAppleMaxHrToProfile(athlete.max_hr_source)) {
            const inferred = inferMaxHrFromAppleWorkouts(workouts);
            const curMax = parseMaxHrDisplay(athlete.max_hr);
            const nextMax = nextProfileMaxHrFromApple(curMax, inferred);
            const needsMaxHrWrite =
              nextMax !== null &&
              (curMax !== nextMax || athlete.max_hr_source !== 'apple_watch');
            if (needsMaxHrWrite) {
              const { error: maxHrErr } = await supabase
                .from('athletes')
                .update({ max_hr: nextMax, max_hr_source: 'apple_watch' })
                .eq('id', athlete.id);
              if (!maxHrErr) {
                setAthlete((prev) =>
                  prev ? { ...prev, max_hr: nextMax, max_hr_source: 'apple_watch' } : prev,
                );
              }
            }
          }
        } catch (err) {
          toast.error('Step 2 failed: ' + String(err));
          return;
        }

        try {
          toast.success(`Synced ${processed} workout(s).`);

          toast.message('Sync: refreshing profile...');
          try {
            await loadProfile();
            await promptFromAppleSync(athlete.id, workouts, syncResults);
            await refreshAchievements();
          } catch {
            // profile reload failed silently — sync was still successful
          }
        } catch (err) {
          toast.error('Step 3 failed: ' + String(err));
        }
        return;
      }

      if (whoopConnection != null || athleteWearsWhoop(athlete.wearables ?? null)) {
        toast.message('WHOOP syncs automatically via webhook — no manual sync needed.');
        return;
      }

      if (terraConnections.length > 0) {
        const provider = terraConnections[0].provider;
        const isGarmin = String(provider).toUpperCase() === 'GARMIN';
        toast.message(
          isGarmin
            ? 'Garmin syncs automatically via webhook — no manual sync needed.'
            : `${providerLabel(provider)} syncs automatically via webhook — no manual sync needed.`,
        );
        return;
      }

      if (wearsApple && !despiaIphone) {
        toast.message('Apple Watch sync is available in the RNKX iPhone app with Health access.');
        return;
      }

      toast.error('No device connected. Please connect a wearable first.');
    } catch (err) {
      toast.error('Sync crashed: ' + String(err));
      console.error('[handleSync] crash:', err);
    } finally {
      setSyncing(false);
    }
  };

  /** Same sign-out path used across the app: `supabase.auth.signOut()` then login. */
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

  async function performDeleteAccount() {
    setDeleteAccountWorking(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Not signed in.');
        return;
      }

      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) {
        toast.error(error.message || 'Could not delete account');
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Your account has been deleted.');
      setDeleteAccountOpen(false);
      await supabase.auth.signOut();
      navigate('/auth', { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete account');
    } finally {
      setDeleteAccountWorking(false);
    }
  }

  async function openTerraWidget() {
    if (!athlete?.id) return;
    try {
      setTerraConnecting(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Could not open device connection');
        return;
      }
      const { data, error } = await supabase.functions.invoke('terra-widget-session', {
        body: { reference_id: athlete.id },
      });
      if (error || !(data as { url?: string } | null)?.url) {
        toast.error('Could not open device connection');
        return;
      }
      window.location.href = (data as { url: string }).url;
    } catch {
      toast.error('Could not open device connection');
    } finally {
      setTerraConnecting(false);
    }
  }

  async function handleTerraDisconnect(row: TerraConnectionRow) {
    if (!athlete?.id) return;
    setDisconnectingId(row.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error('Not signed in.');
        return;
      }
      const { data, error } = await supabase.functions.invoke('terra-disconnect', {
        body: { terra_user_id: row.terra_user_id, provider: row.provider },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const wearables = (data as { wearables?: string[] } | null)?.wearables;
      setTerraConnections((prev) => prev.filter((r) => r.id !== row.id));
      setAthlete((prev) =>
        prev && wearables != null ? { ...prev, wearables } : prev,
      );
      toast.success(`${providerLabel(row.provider)} disconnected.`);
    } catch {
      toast.error('Disconnect failed.');
    } finally {
      setDisconnectingId(null);
    }
  }

  async function handleConnectAppleWatch() {
    if (!athlete?.id) return;
    setAppleConnecting(true);
    setAppleError(null);
    try {
      await despia(`healthkit://workouts?days=1&included=${SYNC_INCLUDED_HR}`, ['healthkitWorkouts']);

      const current = athlete.wearables ?? [];
      const nextWearables = Array.from(new Set([...current, 'apple_watch']));
      const { error } = await supabase
        .from('athletes')
        .update({ wearables: nextWearables })
        .eq('id', athlete.id);
      if (error) {
        toast.error(error.message);
        setAppleError(error.message);
        return;
      }
      setAthlete((prev) => (prev ? { ...prev, wearables: nextWearables } : prev));
      setAppleHkLiveOk(true);
      toast.success('Apple Watch connected!');
      if (!localStorage.getItem(HK_SYNC_WARNING_KEY)) {
        setShowHkSyncWarning(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not connect Apple Watch.';
      setAppleError(message);
      toast.error(message);
    } finally {
      setAppleConnecting(false);
    }
  }

  async function handleDisconnectAppleWatch() {
    if (!athlete?.id) return;
    setAppleConnecting(true);
    try {
      const nextWearables = (athlete.wearables ?? []).filter((w) => {
        const v = String(w).toLowerCase();
        return v !== 'apple' && v !== 'apple_watch';
      });
      const { error } = await supabase
        .from('athletes')
        .update({ wearables: nextWearables })
        .eq('id', athlete.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setAthlete((prev) => (prev ? { ...prev, wearables: nextWearables } : prev));
      setAppleHkLiveOk(null);
      toast.success('Apple Watch disconnected');
    } catch {
      toast.error('Disconnect failed.');
    } finally {
      setAppleConnecting(false);
    }
  }

  async function handleWhoopDisconnect() {
    if (!athlete?.id || !whoopConnection) return;
    setDisconnectingWhoop(true);
    try {
      const { error } = await supabase.from('whoop_connections').delete().eq('id', whoopConnection.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      const wearables = (athlete.wearables ?? []).filter((w) => String(w).toLowerCase() !== 'whoop');
      const { error: upErr } = await supabase.from('athletes').update({ wearables }).eq('id', athlete.id);
      if (upErr) {
        toast.error(upErr.message);
        return;
      }
      setWhoopConnection(null);
      setAthlete((prev) => (prev ? { ...prev, wearables } : prev));
      toast.success('WHOOP disconnected.');
    } catch {
      toast.error('Disconnect failed.');
    } finally {
      setDisconnectingWhoop(false);
    }
  }

  async function handlePasswordResetEmail() {
    if (!userEmail?.trim()) {
      toast.error('No email on file for this account.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail.trim(), {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Check your email for a password reset link.');
  }

  async function saveDisplayNameInline(): Promise<boolean> {
    if (!athlete?.id) return false;
    const v = nameDraft.trim();
    if (!v) {
      toast.error('Display name cannot be empty.');
      return false;
    }
    setNameSaving(true);
    try {
      const { error } = await supabase.from('athletes').update({ display_name: v }).eq('id', athlete.id);
      if (error) {
        toast.error(error.message);
        return false;
      }
      setAthlete((prev) => (prev ? { ...prev, display_name: v } : prev));
      toast.success('Name updated.');
      return true;
    } finally {
      setNameSaving(false);
    }
  }

  async function saveUsernameInline(): Promise<boolean> {
    if (!athlete?.id) return false;
    const v = usernameDraft.trim().replace(/^@/, '');
    if (!v) {
      toast.error('Username cannot be empty.');
      return false;
    }
    setUsernameSaving(true);
    try {
      const { error } = await supabase.from('athletes').update({ username: v }).eq('id', athlete.id);
      if (error) {
        if (error.code === '23505') {
          toast.error('That username is already taken.');
        } else {
          toast.error(error.message);
        }
        return false;
      }
      setAthlete((prev) => (prev ? { ...prev, username: v } : prev));
      toast.success('Username updated.');
      return true;
    } finally {
      setUsernameSaving(false);
    }
  }

  function effectiveSelectedLeagues(): string[] {
    const s = athlete?.selected_leagues;
    if (s == null || s.length === 0) return ['engine', 'run'];
    return s;
  }

  async function toggleCompetitionLeague(league: 'engine' | 'run') {
    if (!athlete?.id || settingsBusy) return;
    const cur = effectiveSelectedLeagues();
    const has = cur.includes(league);
    const next = has ? cur.filter((x) => x !== league) : [...cur, league];
    if (next.length === 0) {
      toast.error('Select at least one league.');
      return;
    }
    setSettingsBusy(true);
    try {
      const { error } = await supabase.from('athletes').update({ selected_leagues: next }).eq('id', athlete.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setAthlete((prev) => (prev ? { ...prev, selected_leagues: next } : prev));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function setHealthDataEnabled(value: boolean) {
    if (!athlete?.id || settingsBusy) return;
    setSettingsBusy(true);
    try {
      const { error } = await supabase.from('athletes').update({ health_data_enabled: value }).eq('id', athlete.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setAthlete((prev) => (prev ? { ...prev, health_data_enabled: value } : prev));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function setProfilePublic(value: boolean) {
    if (!athlete?.id || settingsBusy) return;
    setSettingsBusy(true);
    try {
      const { error } = await supabase.from('athletes').update({ profile_public: value }).eq('id', athlete.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setAthlete((prev) => (prev ? { ...prev, profile_public: value } : prev));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function sendSupportMessage(): Promise<boolean> {
    if (!athlete?.id) return false;
    const body = supportBody.trim();
    if (!body) {
      toast.error('Please describe your issue.');
      return false;
    }
    setSupportSending(true);
    try {
      const { error } = await supabase.from('support_messages').insert({ athlete_id: athlete.id, body });
      if (error) {
        toast.error(error.message);
        return false;
      }
      setSupportBody('');
      toast.success('Thanks — our team will get back to you soon.');
      return true;
    } finally {
      setSupportSending(false);
    }
  }

  async function handleRestorePurchases() {
    setRestorePurchasing(true);
    try {
      const result = await restoreInAppPurchasesAndApplyPremium();
      if (result === 'premium') {
        setAthlete((prev) => (prev ? { ...prev, is_premium: true } : prev));
        toast.success('Premium unlocked! 🎉');
      } else if (result === 'none') {
        toast.message('No active subscription found');
      } else if (result === 'restore_error') {
        toast.error('Could not restore purchases. Try again.');
      } else {
        toast.message('Restore purchases is only available in the RNKX app.');
      }
    } finally {
      setRestorePurchasing(false);
    }
  }

  function handleAssistantOpenChange(open: boolean) {
    setAssistantOpen(open);
    if (!open) {
      setAssistantInput('');
      setAssistantReply(null);
    }
  }

  function handleAssistantSend() {
    setAssistantReply(getScoringAssistantReply(assistantInput));
  }

  function handleAssistantSuggestion(question: string) {
    setAssistantInput(question);
    setAssistantReply(getScoringAssistantReply(question));
  }

  const wearsApple = athleteWearsApple(athlete?.wearables ?? null);
  const appleConnected =
    appleHkLiveOk === true
      ? true
      : appleHkLiveOk === false
        ? false
        : wearsApple;
  const appleCardConnected = appleConnected;
  const hasConnectedSyncDevice =
    athleteWearsApple(athlete?.wearables ?? null) || whoopConnection != null || terraConnections.length > 0;

  const selectedLeagues = effectiveSelectedLeagues();
  const maxHrDisplay = parseMaxHrDisplay(athlete?.max_hr ?? null);

  function closeSettingsDialog() {
    setSettingsDialog(null);
    setTerraDialogRow(null);
  }

  function openSettingsDialog(dialog: SettingsDialog) {
    if (!athlete) return;
    if (dialog === 'displayName') {
      setNameDraft(athlete.display_name);
    }
    if (dialog === 'username') {
      setUsernameDraft(athlete.username ?? '');
    }
    setSettingsDialog(dialog);
  }

  function openTerraSettingsDialog(row: TerraConnectionRow) {
    setTerraDialogRow(row);
    setSettingsDialog('terraDevice');
  }

  async function startWhoopConnect() {
    if (!athlete?.id) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error('Missing auth session.');
      return;
    }
    const statePayload = btoa(
      JSON.stringify({
        nonce: 'rnkx_whoop_auth',
        token: session.access_token,
        athlete_id: athlete.id,
      }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    window.location.href = `${WHOOP_OAUTH_AUTHORIZE_BASE}&state=${encodeURIComponent(statePayload)}`;
  }

  function dismissHkSyncWarning() {
    localStorage.setItem(HK_SYNC_WARNING_KEY, 'true');
    setShowHkSyncWarning(false);
  }

  return (
  <>
    <SettingsPageLayout
      loading={loading}
      athlete={athlete}
      userEmail={userEmail}
      terraConnections={terraConnections}
      whoopConnected={whoopConnection != null}
      appleConnected={appleCardConnected}
      appleError={appleError}
      appleConnecting={appleConnecting}
      disconnectingWhoop={disconnectingWhoop}
      disconnectingId={disconnectingId}
      terraConnecting={terraConnecting}
      syncing={syncing}
      hasConnectedSyncDevice={hasConnectedSyncDevice}
      selectedLeagues={selectedLeagues}
      maxHrDisplay={maxHrDisplay}
      settingsBusy={settingsBusy}
      settingsDialog={settingsDialog}
      terraDialogRow={terraDialogRow}
      nameDraft={nameDraft}
      nameSaving={nameSaving}
      usernameDraft={usernameDraft}
      usernameSaving={usernameSaving}
      supportBody={supportBody}
      supportSending={supportSending}
      restorePurchasing={restorePurchasing}
      assistantOpen={assistantOpen}
      assistantInput={assistantInput}
      assistantReply={assistantReply}
      deleteAccountOpen={deleteAccountOpen}
      deleteAccountWorking={deleteAccountWorking}
      wearableLogoForCode={wearableLogoForCode}
      onSync={() => void handleSync()}
      onOpenDialog={openSettingsDialog}
      onOpenTerraDialog={openTerraSettingsDialog}
      onCloseDialog={closeSettingsDialog}
      onConnectDevice={() => void openTerraWidget()}
      onConnectApple={() => void handleConnectAppleWatch()}
      onDisconnectApple={() => void handleDisconnectAppleWatch()}
      onConnectWhoop={() => void startWhoopConnect()}
      onDisconnectWhoop={() => void handleWhoopDisconnect()}
      onDisconnectTerra={(row) => void handleTerraDisconnect(row)}
      onNameDraftChange={setNameDraft}
      onSaveDisplayName={() =>
        void saveDisplayNameInline().then((ok) => {
          if (ok) closeSettingsDialog();
        })
      }
      onUsernameDraftChange={setUsernameDraft}
      onSaveUsername={() =>
        void saveUsernameInline().then((ok) => {
          if (ok) closeSettingsDialog();
        })
      }
      onPasswordReset={() => {
        void handlePasswordResetEmail();
        closeSettingsDialog();
      }}
      onToggleLeague={(league) => void toggleCompetitionLeague(league)}
      onHealthDataChange={(value) => void setHealthDataEnabled(value)}
      onProfilePublicChange={(value) => void setProfilePublic(value)}
      onRestorePurchases={() => void handleRestorePurchases()}
      onUnlockPremium={() => {
        if (!athlete) return;
        const uid = athlete.user_id;
        if (uid) presentPaywall(uid);
        else window.location.href = '/premium';
      }}
      onAssistantOpenChange={handleAssistantOpenChange}
      onAssistantInputChange={setAssistantInput}
      onAssistantSend={handleAssistantSend}
      onAssistantSuggestion={handleAssistantSuggestion}
      onSupportBodyChange={setSupportBody}
      onSendSupport={() =>
        void sendSupportMessage().then((ok) => {
          if (ok) closeSettingsDialog();
        })
      }
      onSignOut={() => void handleSignOut()}
      onDeleteAccountOpen={() => setDeleteAccountOpen(true)}
      onDeleteAccountClose={(open) => !deleteAccountWorking && setDeleteAccountOpen(open)}
      onDeleteAccountConfirm={() => void performDeleteAccount()}
    />

    <AlertDialog open={showHkSyncWarning} onOpenChange={(open) => !open && dismissHkSyncWarning()}>
      <AlertDialogContent className="border-border bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle>Important — Sync Your Workouts</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
            RNKX can only score workouts that have been manually synced. If you have trained this
            week, please open the Health app and sync your recent workouts now before Sunday
            midnight GMT — otherwise they won't count towards this week's leaderboard.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            className="w-full bg-neon-lime text-black hover:bg-neon-lime/90"
            onClick={dismissHkSyncWarning}
          >
            Got it
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
