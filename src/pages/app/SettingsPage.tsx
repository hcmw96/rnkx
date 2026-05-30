import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import despia from 'despia-native';
import {
  Activity,
  Check,
  ChevronRight,
  CreditCard,
  FileText,
  Heart,
  HelpCircle,
  Info,
  LogOut,
  MessageCircle,
  RotateCcw,
  Send,
  Shield,
  Trash2,
  User,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { SHOW_RECOVERY } from '@/lib/featureFlags';
import RecoveryPage from '@/pages/app/RecoveryPage';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AppleLogo,
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
import { cn } from '@/lib/utils';
import { useAchievementUnlock } from '@/context/AchievementUnlockContext';
import { useScoreSharePrompt } from '@/context/ScoreSharePromptContext';
import { syncAppleWorkoutsToDatabase } from '@/lib/syncActivitiesApple';
import { fetchRecentWorkouts } from '@/services/despia';
import { presentPaywall, restoreInAppPurchasesAndApplyPremium } from '@/services/revenuecat';
import { supabase } from '@/services/supabase';

const ATHLETE_COLUMNS =
  'id,username,display_name,country,avatar_url,total_score,selected_leagues,wearables,user_id,max_hr,max_hr_source,is_premium,health_data_enabled,profile_public';

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
}

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

function ConnectedBadge() {
  return (
    <span className="shrink-0 rounded-full border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">
      Connected
    </span>
  );
}

function isDespiaWebView(): boolean {
  if (typeof window === 'undefined') return false;
  const hasDespiaBridge = (window as Window & { despia?: unknown }).despia != null;
  const isIosUa = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return hasDespiaBridge || isIosUa;
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

function labelForMaxHrSource(source: string | null | undefined): string {
  switch (source) {
    case 'manual':
      return 'Set manually';
    case 'whoop_historic':
    case 'whoop_live':
      return 'Detected from WHOOP';
    case 'terra_live':
      return 'Detected from your wearable';
    case 'apple_watch':
      return 'Detected from Apple Watch';
    default:
      return source ? `Source: ${source}` : '';
  }
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
  /** Despia iPhone HealthKit probe: null until resolved; irrelevant when DB has no apple wearable. */
  const [appleHkLiveOk, setAppleHkLiveOk] = useState<boolean | null>(null);
  const [appleError, setAppleError] = useState<string | null>(null);
  const [maxHrEditing, setMaxHrEditing] = useState(false);
  const [maxHrDraft, setMaxHrDraft] = useState('');
  const [maxHrSaving, setMaxHrSaving] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [restorePurchasing, setRestorePurchasing] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountWorking, setDeleteAccountWorking] = useState(false);
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
        toast.message('Sync: uploading ' + workouts.length + ' workouts...');

        let processed = 0;
        let syncResults: Awaited<ReturnType<typeof syncAppleWorkoutsToDatabase>>['results'] = [];
        try {
          const upload = await syncAppleWorkoutsToDatabase(athlete.id, workouts);
          if (upload.error) {
            toast.error('Step 2 failed: ' + upload.error);
            return;
          }
          processed = upload.processed;
          syncResults = upload.results;

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

  async function saveMaxHrManual() {
    if (!athlete?.id) return;
    const n = Number(maxHrDraft.trim());
    if (!Number.isFinite(n) || n < 60 || n > 240) {
      toast.error('Enter a max heart rate between 60 and 240 bpm.');
      return;
    }
    setMaxHrSaving(true);
    try {
      const { error } = await supabase
        .from('athletes')
        .update({ max_hr: Math.round(n), max_hr_source: 'manual' })
        .eq('id', athlete.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setAthlete((prev) =>
        prev ? { ...prev, max_hr: Math.round(n), max_hr_source: 'manual' } : prev,
      );
      setMaxHrEditing(false);
      toast.success('Max HR updated.');
    } finally {
      setMaxHrSaving(false);
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

  async function saveDisplayNameInline() {
    if (!athlete?.id) return;
    const v = nameDraft.trim();
    if (!v) {
      toast.error('Display name cannot be empty.');
      return;
    }
    setNameSaving(true);
    try {
      const { error } = await supabase.from('athletes').update({ display_name: v }).eq('id', athlete.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setAthlete((prev) => (prev ? { ...prev, display_name: v } : prev));
      setNameEditing(false);
      toast.success('Name updated.');
    } finally {
      setNameSaving(false);
    }
  }

  async function saveUsernameInline() {
    if (!athlete?.id) return;
    const v = usernameDraft.trim().replace(/^@/, '');
    if (!v) {
      toast.error('Username cannot be empty.');
      return;
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
        return;
      }
      setAthlete((prev) => (prev ? { ...prev, username: v } : prev));
      setUsernameEditing(false);
      toast.success('Username updated.');
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

  async function sendSupportMessage() {
    if (!athlete?.id) return;
    const body = supportBody.trim();
    if (!body) {
      toast.error('Please describe your issue.');
      return;
    }
    setSupportSending(true);
    try {
      const { error } = await supabase.from('support_messages').insert({ athlete_id: athlete.id, body });
      if (error) {
        toast.error(error.message);
        return;
      }
      setSupportBody('');
      toast.success('Thanks — our team will get back to you soon.');
    } finally {
      setSupportSending(false);
    }
  }

  function openLegal(path: string) {
    window.open(`${window.location.origin}${path}`, '_blank', 'noopener,noreferrer');
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

  function handleAssistantSend() {
    setAssistantOpen(false);
    setAssistantInput('');
    navigate('/app/how-it-works');
  }

  const inDespiaWebView = isDespiaWebView();
  const wearsApple = athleteWearsApple(athlete?.wearables ?? null);
  const appleConnected =
    appleHkLiveOk === true
      ? true
      : appleHkLiveOk === false
        ? false
        : wearsApple;
  const appleCardConnected = appleConnected;
  const hasAnyDevice =
    inDespiaWebView || appleConnected || whoopConnection != null || terraConnections.length > 0;
  const hasConnectedSyncDevice =
    athleteWearsApple(athlete?.wearables ?? null) || whoopConnection != null || terraConnections.length > 0;

  return (
    <AppShell>
      <TooltipProvider delayDuration={200}>
      <section className="mx-auto max-w-lg space-y-6">
        <div className="space-y-1">
          <h1 className="type-page-title">Settings</h1>
          <p className="text-sm text-muted-foreground">Devices, account, privacy, and subscription.</p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        ) : !athlete ? (
          <p className="text-sm text-destructive">Could not load your athlete profile.</p>
        ) : (
          <>
            <AlertDialog open={deleteAccountOpen} onOpenChange={(o) => !deleteAccountWorking && setDeleteAccountOpen(o)}>
              <AlertDialogContent className="border-border bg-card">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete account permanently?</AlertDialogTitle>
                  <AlertDialogDescription className="text-left">
                    Are you sure? This will permanently delete your account and all your data. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteAccountWorking}>Cancel</AlertDialogCancel>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleteAccountWorking}
                    onClick={() => void performDeleteAccount()}
                  >
                    {deleteAccountWorking ? 'Deleting…' : 'Delete my account'}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Dialog open={assistantOpen} onOpenChange={setAssistantOpen}>
              <DialogContent className="max-w-md border-border bg-card">
                <DialogHeader>
                  <DialogTitle className="type-card-title">Ask the Assistant</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    Scoring rules and fair-play guidelines are in How It Works.
                  </p>
                </DialogHeader>
                <Input
                  placeholder="Ask about scoring, leagues, or fair play…"
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAssistantSend();
                  }}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAssistantOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" className="bg-neon-lime text-black hover:bg-neon-lime/90" onClick={handleAssistantSend}>
                    View scoring rules
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="type-card-title">Max HR</h2>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="About max heart rate"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-left" side="top">
                      Your max heart rate is used to calculate workout intensity and scores accurately
                    </TooltipContent>
                  </Tooltip>
                </div>
                {!maxHrEditing ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      const cur = parseMaxHrDisplay(athlete.max_hr);
                      setMaxHrDraft(cur != null ? String(cur) : '');
                      setMaxHrEditing(true);
                    }}
                  >
                    Edit
                  </Button>
                ) : null}
              </div>
              {!maxHrEditing ? (
                <div className="mt-3 space-y-1">
                  <p className="type-stat text-foreground tabular-nums">
                    {parseMaxHrDisplay(athlete.max_hr) != null
                      ? `${parseMaxHrDisplay(athlete.max_hr)} bpm`
                      : 'Not set'}
                  </p>
                  <p className="type-meta">
                    {labelForMaxHrSource(athlete.max_hr_source) ||
                      (parseMaxHrDisplay(athlete.max_hr) != null ? '—' : '')}
                  </p>
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    <label htmlFor="max-hr-input" className="text-xs font-medium text-muted-foreground">
                      Beats per minute (bpm)
                    </label>
                    <Input
                      id="max-hr-input"
                      type="number"
                      inputMode="numeric"
                      min={60}
                      max={240}
                      value={maxHrDraft}
                      onChange={(e) => setMaxHrDraft(e.target.value)}
                      className="max-w-[12rem]"
                      placeholder="e.g. 185"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={maxHrSaving}
                      onClick={() => void saveMaxHrManual()}
                    >
                      {maxHrSaving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={maxHrSaving}
                      onClick={() => setMaxHrEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </article>

            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="type-card-title">Connected Devices</h2>

              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                        <WhoopLogo className="h-8 max-w-[3rem]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">WHOOP</p>
                        <p className="type-meta">Direct connection</p>
                      </div>
                      {whoopConnection ? <ConnectedBadge /> : null}
                    </div>
                    {whoopConnection ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-8 shrink-0 self-start text-xs sm:self-center"
                        disabled={disconnectingWhoop}
                        onClick={() => void handleWhoopDisconnect()}
                      >
                        {disconnectingWhoop ? '…' : 'Disconnect'}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 shrink-0 self-start text-xs font-semibold sm:self-center"
                        onClick={async () => {
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
                        }}
                      >
                        Connect WHOOP
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                          <AppleLogo className="h-8 w-8" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">Apple Watch</p>
                          <p className="type-meta">HealthKit</p>
                        </div>
                        {appleCardConnected ? <ConnectedBadge /> : null}
                      </div>
                      {!appleCardConnected ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-8 shrink-0 self-start text-xs font-semibold sm:self-center"
                          disabled={appleConnecting}
                          onClick={() => void handleConnectAppleWatch()}
                        >
                          {appleConnecting ? '…' : 'Connect Apple Watch'}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="h-8 shrink-0 self-start text-xs sm:self-center"
                          disabled={appleConnecting}
                          onClick={() => void handleDisconnectAppleWatch()}
                        >
                          {appleConnecting ? '…' : 'Disconnect'}
                        </Button>
                      )}
                    </div>
                    {appleCardConnected ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        To fully disconnect, go to iOS Settings {'>'} Health {'>'} Data Access
                      </p>
                    ) : null}
                    {appleError ? (
                      <p className="mt-2 text-xs text-destructive">{appleError}</p>
                    ) : null}
                </div>

                {terraConnections.map((row) => {
                  const Logo = wearableLogoForCode(row.provider);
                  const name = providerLabel(row.provider);
                  return (
                    <div
                      key={row.id}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 px-3 py-3 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                          {Logo ? (
                            <Logo className="h-8 max-w-[3rem]" />
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground">
                              {row.provider.slice(0, 3)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">{name}</p>
                        </div>
                        <ConnectedBadge />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-8 shrink-0 self-start text-xs sm:self-center"
                        disabled={disconnectingId === row.id}
                        onClick={() => void handleTerraDisconnect(row)}
                      >
                        {disconnectingId === row.id ? '…' : 'Disconnect'}
                      </Button>
                    </div>
                  );
                })}

                {!hasAnyDevice ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/10 px-3 py-6 text-center">
                    <p className="type-heading">No devices connected</p>
                    <p className="mt-1 text-xs text-muted-foreground">Connect devices to sync your workouts</p>
                  </div>
                ) : null}
              </div>

              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full font-semibold"
                disabled={terraConnecting}
                onClick={() => void openTerraWidget()}
              >
                {terraConnecting ? 'Opening…' : '+ Connect Device'}
              </Button>
            </article>

            <Button
              type="button"
              className="w-full font-semibold bg-neon-lime text-black hover:bg-neon-lime/90"
              disabled={syncing || !hasConnectedSyncDevice}
              onClick={() => void handleSync()}
            >
              {!hasConnectedSyncDevice ? 'Connect a device to sync' : syncing ? 'Syncing…' : 'Sync workouts'}
            </Button>

            {/* ACCOUNT */}
            <article className="space-y-4 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3">
                <User className="h-5 w-5 text-neon-lime" aria-hidden />
                <h2 className="type-section-label">Account</h2>
              </div>
              <div className="space-y-1 border-b border-border/40 pb-3">
                <p className="type-meta uppercase tracking-wide">Email</p>
                <p className="text-sm text-foreground">{userEmail ?? '—'}</p>
              </div>
              <div className="space-y-2 border-b border-border/40 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="type-meta uppercase tracking-wide">Name</p>
                  {!nameEditing ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-neon-lime hover:text-neon-lime"
                      onClick={() => {
                        setNameDraft(athlete.display_name);
                        setNameEditing(true);
                      }}
                    >
                      Edit
                    </Button>
                  ) : null}
                </div>
                {!nameEditing ? (
                  <p className="type-heading">{athlete.display_name}</p>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="sm:max-w-xs"
                      placeholder="Display name"
                    />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" disabled={nameSaving} onClick={() => void saveDisplayNameInline()}>
                        {nameSaving ? 'Saving…' : 'Save'}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" disabled={nameSaving} onClick={() => setNameEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2 border-b border-border/40 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="type-meta uppercase tracking-wide">Username</p>
                  {!usernameEditing ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-neon-lime hover:text-neon-lime"
                      onClick={() => {
                        setUsernameDraft(athlete.username ?? '');
                        setUsernameEditing(true);
                      }}
                    >
                      Edit
                    </Button>
                  ) : null}
                </div>
                {!usernameEditing ? (
                  <p className="type-meta">{athlete.username ?? '—'}</p>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      className="sm:max-w-xs"
                      placeholder="username"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={usernameSaving}
                        onClick={() => void saveUsernameInline()}
                      >
                        {usernameSaving ? 'Saving…' : 'Save'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={usernameSaving}
                        onClick={() => setUsernameEditing(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-start justify-between gap-3 pt-1">
                <div>
                  <p className="type-meta uppercase tracking-wide">Password</p>
                  <p className="mt-1 text-xs text-muted-foreground">Secure your account via email reset</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-sm font-semibold text-neon-lime hover:underline"
                  onClick={() => void handlePasswordResetEmail()}
                >
                  Change
                </button>
              </div>
            </article>

            {/* COMPETITION LEAGUES */}
            <article className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-neon-lime" aria-hidden />
                <h2 className="type-section-label">Competition Leagues</h2>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Select one or both leagues to compete in. You can change this anytime.
              </p>
              <button
                type="button"
                disabled={settingsBusy}
                className={cn(
                  'flex w-full flex-col rounded-xl border bg-zinc-950/50 px-4 py-3 text-left transition',
                  effectiveSelectedLeagues().includes('run')
                    ? 'border-cyan-400/70 ring-1 ring-cyan-500/35'
                    : 'border-border hover:border-muted-foreground/30',
                )}
                onClick={() => void toggleCompetitionLeague('run')}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 text-cyan-300',
                      effectiveSelectedLeagues().includes('run') ? 'border-cyan-400 bg-cyan-500/15' : 'border-muted-foreground/35',
                    )}
                  >
                    {effectiveSelectedLeagues().includes('run') ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">Run League</p>
                    <p className="text-xs text-cyan-200/80">Pace-based scoring</p>
                  </div>
                </div>
              </button>
              <button
                type="button"
                disabled={settingsBusy}
                className={cn(
                  'flex w-full flex-col rounded-xl border bg-zinc-950/50 px-4 py-3 text-left transition',
                  effectiveSelectedLeagues().includes('engine')
                    ? 'border-neon-lime/70 ring-1 ring-neon-lime/25'
                    : 'border-border hover:border-muted-foreground/30',
                )}
                onClick={() => void toggleCompetitionLeague('engine')}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 text-neon-lime',
                      effectiveSelectedLeagues().includes('engine')
                        ? 'border-neon-lime bg-neon-lime/10'
                        : 'border-muted-foreground/35',
                    )}
                  >
                    {effectiveSelectedLeagues().includes('engine') ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">Engine League</p>
                    <p className="text-xs text-emerald-200/80">Heart rate-based scoring</p>
                  </div>
                </div>
              </button>
            </article>

            {/* HOW IT WORKS */}
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:bg-muted/30"
              onClick={() => navigate('/app/how-it-works')}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                <HelpCircle className="h-5 w-5 text-neon-lime" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">How It Works</p>
                <p className="type-meta">View scoring rules & fair play guidelines</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>

            {/* ASK ASSISTANT */}
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:bg-muted/30"
              onClick={() => setAssistantOpen(true)}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                <MessageCircle className="h-5 w-5 text-neon-lime" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">Ask the Assistant</p>
                <p className="type-meta">Get help with scoring & rules</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                <MessageCircle className="h-4 w-4" aria-hidden />
              </div>
            </button>

            {SHOW_RECOVERY ? (
            <article id="recovery" className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-neon-lime" aria-hidden />
                <h2 className="type-section-label">Recovery</h2>
              </div>
              <PremiumGate
                athleteId={athlete.id}
                userId={athlete.user_id ?? undefined}
                badge="PREMIUM"
                title="Recovery insights"
                description="Trend charts, load guidance, and readiness — included with RNKX Premium"
              >
                <RecoveryPage embedded />
              </PremiumGate>
            </article>
            ) : null}

            {/* HEALTH DATA */}
            <article className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-neon-lime" aria-hidden />
                <h2 className="type-section-label">Health Data</h2>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="type-heading">Share health data</p>
                  <p className="type-meta">Allow RNKX to sync your health metrics</p>
                </div>
                <Switch
                  checked={athlete.health_data_enabled ?? true}
                  disabled={settingsBusy}
                  onCheckedChange={(v) => void setHealthDataEnabled(v)}
                  className="data-[state=checked]:bg-neon-lime"
                />
              </div>
            </article>

            {/* PRIVACY */}
            <article className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-neon-lime" aria-hidden />
                <h2 className="type-section-label">Privacy</h2>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="type-heading">Public profile</p>
                  <p className="type-meta">Others can see your rank on leaderboards</p>
                </div>
                <Switch
                  checked={athlete.profile_public ?? true}
                  disabled={settingsBusy}
                  onCheckedChange={(v) => void setProfilePublic(v)}
                  className="data-[state=checked]:bg-neon-lime"
                />
              </div>
            </article>

            {/* SUBSCRIPTION */}
            <article className="space-y-4 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-neon-lime" aria-hidden />
                <h2 className="type-section-label">Subscription</h2>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-zinc-950/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Current Plan</span>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
                    athlete.is_premium ? 'bg-neon-lime/20 text-neon-lime' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {athlete.is_premium ? 'Premium' : 'Free'}
                </span>
              </div>
              {!athlete.is_premium ? (
                <div className="relative overflow-hidden rounded-xl border border-neon-lime/35 bg-gradient-to-br from-zinc-900 to-zinc-950 p-4">
                  <span className="absolute right-3 top-3 rounded bg-neon-lime px-2 py-0.5 text-xs font-bold uppercase text-black">
                    BEST VALUE
                  </span>
                  <p className="pr-20 text-sm font-semibold text-foreground">Unlock friends, clubs & insights</p>
                  <p className="mt-1 text-xs text-muted-foreground">£79.99 /year · £6.70/month</p>
                  <Button
                    type="button"
                    className="mt-4 w-full bg-neon-lime font-semibold text-black hover:bg-neon-lime/90"
                    onClick={() => {
                      const uid = athlete.user_id;
                      if (uid) presentPaywall(uid);
                      else window.location.href = '/premium';
                    }}
                  >
                    Unlock Premium
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">You have an active Premium subscription. Thank you for supporting RNKX!</p>
              )}
            </article>

            {/* RESTORE PURCHASES */}
            <button
              type="button"
              disabled={restorePurchasing}
              className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:bg-muted/30 disabled:pointer-events-none disabled:opacity-50"
              onClick={() => void handleRestorePurchases()}
            >
              <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-neon-lime" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Restore Purchases</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Restores a previously purchased subscription after reinstalling or changing devices
                </p>
              </div>
            </button>

            {/* CONTACT SUPPORT */}
            <article className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-neon-lime" aria-hidden />
                <h2 className="type-section-label">Contact Support</h2>
              </div>
              <p className="text-sm text-muted-foreground">Need help? Send us a message</p>
              <Textarea
                placeholder="Describe your issue or question…"
                value={supportBody}
                onChange={(e) => setSupportBody(e.target.value)}
                className="min-h-[100px] resize-none border-border bg-background"
              />
              <Button
                type="button"
                className="w-full bg-neon-lime font-semibold text-black hover:bg-neon-lime/90"
                disabled={supportSending}
                onClick={() => void sendSupportMessage()}
              >
                <Send className="h-4 w-4" aria-hidden />
                {supportSending ? 'Sending…' : 'Send Message'}
              </Button>
            </article>

            {/* LEGAL */}
            <article className="space-y-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 pb-2">
                <FileText className="h-5 w-5 text-neon-lime" aria-hidden />
                <h2 className="type-section-label">Legal</h2>
              </div>
              {(
                [
                  ['Privacy Policy', '/privacy'],
                  ['Terms & Conditions', '/terms'],
                  ['User Waiver', '/waiver'],
                  ['Cookies Policy', '/cookies'],
                ] as const
              ).map(([label, path]) => (
                <button
                  key={path}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-transparent px-2 py-2 text-left text-sm text-foreground hover:border-border hover:bg-muted/20"
                  onClick={() => openLegal(path)}
                >
                  {label}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                </button>
              ))}
            </article>

            <Button
              type="button"
              variant="outline"
              className="w-full border-border bg-zinc-950 py-6 font-semibold text-foreground hover:bg-zinc-900"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </Button>

            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold text-destructive hover:underline"
              onClick={() => setDeleteAccountOpen(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete account
            </button>
          </>
        )}
      </section>
      </TooltipProvider>
    </AppShell>
  );
}
