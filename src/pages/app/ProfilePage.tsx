import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
  Share2,
  Shield,
  Trash2,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '@/components/app/AppShell';
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
import { getCountryByName } from '@/data/countries';
import { isDespiaIphoneUa } from '@/lib/despiaPlatform';
import { cn } from '@/lib/utils';
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

interface FriendMini {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  rank: number | null;
  total_score: number;
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

function numScore(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v);
}

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
    default:
      return source ? `Source: ${source}` : '';
  }
}

function parseMaxHrDisplay(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function twoLetterAvatar(username: string | null, displayName: string | null): string {
  const u = (username ?? '').trim();
  if (u.length >= 2) return u.slice(0, 2).toUpperCase();
  if (u.length === 1) return `${u}${(displayName ?? '?').charAt(0)}`.toUpperCase().slice(0, 2);
  const d = (displayName ?? '').trim();
  if (d.length >= 2) return d.slice(0, 2).toUpperCase();
  if (d.length === 1) return `${d}?`.toUpperCase();
  return '??';
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [athlete, setAthlete] = useState<AthleteRow | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
  const [friendsMini, setFriendsMini] = useState<FriendMini[]>([]);
  const [friendsMiniLoading, setFriendsMiniLoading] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState('');
  const [supportBody, setSupportBody] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [restorePurchasing, setRestorePurchasing] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountWorking, setDeleteAccountWorking] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      toast.error(authErr?.message ?? 'Not signed in.');
      setAthlete(null);
      setTerraConnections([]);
      setWhoopConnection(null);
      setAppleHkLiveOk(null);
      setRank(null);
      setUserEmail(null);
      setLoading(false);
      return;
    }

    setUserEmail(auth.user.email ?? null);
    const uid = auth.user.id;
    const [{ data: rankRow, error: rankErr }, byUserId, byId] = await Promise.all([
      supabase.from('leaderboard').select('rank').eq('id', uid).maybeSingle(),
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

    if (rankErr) {
      setRank(null);
    } else {
      setRank((rankRow as { rank: number } | null)?.rank ?? null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const loadFriendsMini = useCallback(async () => {
    if (!athlete?.id) {
      setFriendsMini([]);
      return;
    }
    setFriendsMiniLoading(true);
    const aid = athlete.id;
    const { data: accepted, error: accErr } = await supabase
      .from('friendships')
      .select('id, athlete_id, friend_id, status')
      .or(`athlete_id.eq.${aid},friend_id.eq.${aid}`)
      .eq('status', 'accepted');

    if (accErr) {
      setFriendsMini([]);
      setFriendsMiniLoading(false);
      return;
    }
    const friendIds = (accepted ?? []).map((r) =>
      (r as { athlete_id: string; friend_id: string }).athlete_id === aid
        ? (r as { friend_id: string }).friend_id
        : (r as { athlete_id: string }).athlete_id,
    );
    const unique = [...new Set(friendIds)];
    if (!unique.length) {
      setFriendsMini([]);
      setFriendsMiniLoading(false);
      return;
    }
    const [{ data: aths }, { data: lb }] = await Promise.all([
      supabase.from('athletes').select('id, username, display_name, avatar_url').in('id', unique),
      supabase.from('leaderboard').select('id, rank, total_score').in('id', unique),
    ]);
    const lbMap = new Map((lb ?? []).map((l) => [l.id as string, l]));
    setFriendsMini(
      (aths ?? []).map((a) => {
        const row = lbMap.get(a.id as string);
        return {
          id: a.id as string,
          username: (a as { username: string | null }).username,
          display_name: (a as { display_name: string | null }).display_name,
          avatar_url: (a as { avatar_url: string | null }).avatar_url,
          rank: row?.rank != null ? Number(row.rank) : null,
          total_score: row?.total_score != null ? Number(row.total_score) : 0,
        };
      }),
    );
    setFriendsMiniLoading(false);
  }, [athlete?.id]);

  useEffect(() => {
    void loadFriendsMini();
  }, [loadFriendsMini]);

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
    if (!athlete?.id) return;

    const wearablesSnapshot = athlete.wearables;

    if (!athleteWearsApple(wearablesSnapshot) || !isDespiaIphoneUa()) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const result = await despia(
          'healthkit://workouts?days=5&included=HKQuantityTypeIdentifierHeartRateAverage',
          ['healthkitWorkouts'],
        );
        if (cancelled) return;
        const rawWorkouts = (result as Record<string, unknown> | null)?.healthkitWorkouts;
        if (Array.isArray(rawWorkouts) && rawWorkouts.length >= 1) {
          setAppleHkLiveOk(true);
        } else {
          setAppleHkLiveOk(null);
        }
      } catch {
        if (cancelled) return;
        setAppleHkLiveOk(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [athlete?.id, athleteWearablesKey]);

  const openAvatarPicker = () => {
    fileInputRef.current?.click();
  };

  const onAvatarFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !athlete?.id) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.');
      return;
    }

    setUploading(true);
    const path = `${athlete.id}/avatar.jpg`;

    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/jpeg',
    });

    if (uploadError) {
      toast.error(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    const { error: updateError } = await supabase.from('athletes').update({ avatar_url: publicUrl }).eq('id', athlete.id);

    if (updateError) {
      toast.error(updateError.message);
      setUploading(false);
      return;
    }

    setAthlete((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
    toast.success('Profile photo updated.');
    setUploading(false);
  };

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
        toast.message('Sync: reading HealthKit...');

        let syncData: Awaited<ReturnType<typeof fetchRecentWorkouts>>;
        try {
          syncData = await fetchRecentWorkouts();
        } catch (err) {
          toast.error('Step 1 failed: ' + String(err));
          return;
        }
        if (syncData.error) {
          toast.error('fetchRecentWorkouts failed', { description: syncData.error });
          return;
        }

        const workouts = syncData.workouts;
        toast.message('Sync: uploading ' + workouts.length + ' workouts...');

        let response: Response;
        try {
          response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-activities`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                appleWorkouts: workouts,
                source: 'apple',
                athlete_id: athlete.id,
              }),
            },
          );
        } catch (err) {
          toast.error('Step 2 failed: ' + String(err));
          return;
        }

        if (!response.ok) {
          try {
            const errText = await response.text();
            toast.error(`sync-activities HTTP ${response.status}`, {
              description: errText.slice(0, 500),
            });
          } catch (textErr) {
            toast.error('Step 2 failed: ' + String(textErr), {
              description: `HTTP ${response.status}`,
            });
          }
          return;
        }

        try {
          const data = await response.json();
          toast.success(`Synced ${(data as { processed?: number } | null)?.processed ?? 0} workout(s).`);

          toast.message('Sync: refreshing profile...');
          try {
            await loadProfile();
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
      await despia(
        'healthkit://workouts?days=1&included=HKQuantityTypeIdentifierHeartRateAverage,HKQuantityTypeIdentifierHeartRateMax,HKQuantityTypeIdentifierRunningSpeedAverage,HKQuantityTypeIdentifierDistanceWalkingRunningSum',
        ['healthkitWorkouts'],
      );

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

  const shareProfileCard = async () => {
    const url = `${window.location.origin}/app/profile`;
    const text = 'Check out my RNKX profile!';
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'RNKX', text, url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success('Profile link copied to clipboard');
        return;
      }
      toast.error('Sharing is not supported in this browser.');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Profile link copied to clipboard');
      } catch {
        toast.error('Could not share or copy link.');
      }
    }
  };

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
    toast.message('Assistant coming soon.', { description: 'You will be able to ask about scoring and rules here.' });
  }

  const countryInfo = athlete?.country ? getCountryByName(athlete.country) : null;
  const score = athlete ? numScore(athlete.total_score) : 0;
  const initials = athlete ? twoLetterAvatar(athlete.username, athlete.display_name) : '??';
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-hidden
          onChange={(e) => void onAvatarFile(e)}
        />

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading profile…</p>
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
                  <DialogTitle className="font-display text-lg">Ask the Assistant</DialogTitle>
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
                    Send
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* USER CARD */}
            <article className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-zinc-900/90 to-card p-6 shadow-sm">
              <div className="flex flex-col items-center gap-4 text-center">
                <button
                  type="button"
                  onClick={openAvatarPicker}
                  disabled={uploading}
                  className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full border-2 border-neon-lime/35 bg-muted ring-offset-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  aria-label="Change profile photo"
                >
                  {athlete.avatar_url ? (
                    <img src={athlete.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl font-semibold tracking-wide text-foreground">
                      {initials}
                    </span>
                  )}
                  {uploading ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium text-foreground">
                      …
                    </span>
                  ) : null}
                </button>
                <div className="space-y-1">
                  <h1 className="text-xl font-bold text-white">{athlete.display_name}</h1>
                  <p className="text-sm font-medium text-neon-lime">@{athlete.username ?? '—'}</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-sm text-muted-foreground">
                    {countryInfo?.flag ? (
                      <span className="text-xl leading-none" aria-hidden>
                        {countryInfo.flag}
                      </span>
                    ) : null}
                    <span>{athlete.country ?? 'No country set'}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-neon-lime/40 bg-zinc-950/60 font-semibold text-foreground hover:bg-zinc-900"
                  onClick={() => void shareProfileCard()}
                >
                  <Share2 className="h-4 w-4 text-neon-lime" aria-hidden />
                  Share Your RNKX Social Card
                </Button>
              </div>
            </article>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rank</p>
                <p className="mt-1 font-display text-xl text-foreground">{rank != null ? `#${rank}` : '—'}</p>
              </div>
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Score</p>
                <p className="mt-1 font-display text-xl text-neon-lime">
                  {score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </p>
              </div>
            </div>

            {/* Max HR + devices + sync unchanged below */}
            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">Max HR</h2>
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
                  <p className="text-2xl font-semibold text-foreground tabular-nums">
                    {parseMaxHrDisplay(athlete.max_hr) != null
                      ? `${parseMaxHrDisplay(athlete.max_hr)} bpm`
                      : 'Not set'}
                  </p>
                  <p className="text-xs text-muted-foreground">
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
              <h2 className="text-lg font-semibold text-foreground">Connected Devices</h2>

              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                        <WhoopLogo className="h-8 max-w-[3rem]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">WHOOP</p>
                        <p className="text-xs text-muted-foreground">Direct connection</p>
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
                          <p className="text-xs text-muted-foreground">HealthKit</p>
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
                    <p className="text-sm font-medium text-foreground">No devices connected</p>
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
                <h2 className="font-display text-sm uppercase tracking-wide text-foreground">Account</h2>
              </div>
              <div className="space-y-1 border-b border-border/40 pb-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="text-sm text-foreground">{userEmail ?? '—'}</p>
              </div>
              <div className="space-y-2 border-b border-border/40 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Name</p>
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
                  <p className="text-sm font-medium text-foreground">{athlete.display_name}</p>
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
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Username</p>
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
                  <p className="text-sm font-medium text-foreground">@{athlete.username ?? '—'}</p>
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
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Password</p>
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
                <h2 className="font-display text-sm uppercase tracking-wide text-foreground">Competition Leagues</h2>
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
                <p className="text-xs text-muted-foreground">View scoring rules & fair play guidelines</p>
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
                <p className="text-xs text-muted-foreground">Get help with scoring & rules</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                <MessageCircle className="h-4 w-4" aria-hidden />
              </div>
            </button>

            {/* FRIENDS */}
            <article className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-neon-lime" aria-hidden />
                  <h2 className="font-display text-sm uppercase tracking-wide text-foreground">Friends</h2>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1 border-neon-lime/40 font-semibold text-neon-lime"
                  onClick={() => navigate('/app/social/friends')}
                >
                  <UserPlus className="h-4 w-4" aria-hidden />
                  Add
                </Button>
              </div>
              {friendsMiniLoading ? (
                <p className="text-xs text-muted-foreground">Loading friends…</p>
              ) : friendsMini.length === 0 ? (
                <p className="text-sm text-muted-foreground">No friends yet. Add friends to compare on leaderboards!</p>
              ) : (
                <ul className="space-y-2">
                  {friendsMini.map((f) => (
                    <li key={f.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-zinc-950/40 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{f.display_name || f.username}</p>
                        <p className="text-xs text-muted-foreground">@{f.username ?? '—'}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <span>#{f.rank ?? '—'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            {/* HEALTH DATA */}
            <article className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-neon-lime" aria-hidden />
                <h2 className="font-display text-sm uppercase tracking-wide text-foreground">Health Data</h2>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Share health data</p>
                  <p className="text-xs text-muted-foreground">Allow RNKX to sync your health metrics</p>
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
                <h2 className="font-display text-sm uppercase tracking-wide text-foreground">Privacy</h2>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Public profile</p>
                  <p className="text-xs text-muted-foreground">Others can see your rank on leaderboards</p>
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
                <h2 className="font-display text-sm uppercase tracking-wide text-foreground">Subscription</h2>
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
                  <span className="absolute right-3 top-3 rounded bg-neon-lime px-2 py-0.5 text-[10px] font-bold uppercase text-black">
                    BEST VALUE
                  </span>
                  <p className="pr-20 text-sm font-semibold text-foreground">Unlock friends, mini leagues & insights</p>
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
                <h2 className="font-display text-sm uppercase tracking-wide text-foreground">Contact Support</h2>
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
                <h2 className="font-display text-sm uppercase tracking-wide text-foreground">Legal</h2>
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
