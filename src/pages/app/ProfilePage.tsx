import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
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
import { buildSyncActivitiesAppleBody } from '@/lib/syncActivitiesApple';
import { fetchRecentWorkouts, requestHealthKitPermissions } from '@/services/despia';
import { supabase } from '@/services/supabase';

const ATHLETE_COLUMNS =
  'id,username,display_name,country,avatar_url,total_score,selected_leagues,wearables,user_id';

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
  return typeof window !== 'undefined' && (window as Window & { despia?: unknown }).despia != null;
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
  const [hasAppleActivities, setHasAppleActivities] = useState(false);
  const [appleConnecting, setAppleConnecting] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      toast.error(authErr?.message ?? 'Not signed in.');
      setAthlete(null);
      setTerraConnections([]);
      setWhoopConnection(null);
      setHasAppleActivities(false);
      setRank(null);
      setLoading(false);
      return;
    }

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
      setHasAppleActivities(false);
    } else {
      setAthlete(athleteRow);
      const [{ data: connRows, error: connErr }, whoopRes, appleActRes] = await Promise.all([
        supabase.from('terra_connections').select('id,terra_user_id,provider').eq('athlete_id', athleteRow.id),
        supabase.from('whoop_connections').select('id').eq('athlete_id', athleteRow.id).maybeSingle(),
        supabase
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('athlete_id', athleteRow.id)
          .eq('source', 'apple'),
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
      setHasAppleActivities(!appleActRes.error && (appleActRes.count ?? 0) > 0);
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
    setSyncing(true);
    const syncData = await fetchRecentWorkouts();
    if (syncData.error) {
      toast.error(syncData.error);
      setSyncing(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      toast.error('Missing auth session.');
      setSyncing(false);
      return;
    }

    const { data, error: invokeError } = await supabase.functions.invoke('sync-activities', {
      body: buildSyncActivitiesAppleBody(syncData.workouts),
      headers: { Authorization: `Bearer ${token}` },
    });

    if (invokeError) {
      toast.error(invokeError.message);
    } else {
      toast.success(`Synced ${(data as { processed?: number } | null)?.processed ?? 0} workout(s).`);
      await loadProfile();
    }

    setSyncing(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

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
    setAppleConnecting(true);
    try {
      const ok = await requestHealthKitPermissions();
      if (ok) {
        toast.success('HealthKit access granted.');
        await loadProfile();
      } else {
        toast.error('Could not connect Apple Watch.');
      }
    } catch {
      toast.error('Could not connect Apple Watch.');
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
      const wearables = [...new Set(terraConnections.map((r) => String(r.provider).toUpperCase()))];
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

  const countryInfo = athlete?.country ? getCountryByName(athlete.country) : null;
  const score = athlete ? numScore(athlete.total_score) : 0;
  const initials = athlete ? twoLetterAvatar(athlete.username, athlete.display_name) : '??';
  const inDespiaWebView = isDespiaWebView();
  const wearsApple = (athlete?.wearables ?? []).some((w) => String(w).toLowerCase() === 'apple');
  const appleConnected = wearsApple || hasAppleActivities;
  const hasAnyDevice =
    inDespiaWebView || appleConnected || whoopConnection != null || terraConnections.length > 0;

  return (
    <AppShell>
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
            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                <button
                  type="button"
                  onClick={openAvatarPicker}
                  disabled={uploading}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-border bg-muted ring-offset-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  aria-label="Change profile photo"
                >
                  {athlete.avatar_url ? (
                    <img src={athlete.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-lg font-semibold tracking-wide text-foreground">
                      {initials}
                    </span>
                  )}
                  {uploading ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium text-foreground">
                      …
                    </span>
                  ) : null}
                </button>

                <div className="min-w-0 flex-1 space-y-2">
                  <h1 className="text-xl font-semibold text-foreground">{athlete.display_name}</h1>
                  <p className="text-sm text-muted-foreground">@{athlete.username ?? '—'}</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    {countryInfo?.flag ? (
                      <span className="text-lg leading-none" aria-hidden>
                        {countryInfo.flag}
                      </span>
                    ) : null}
                    {athlete.country ? (
                      <span className="text-sm text-muted-foreground">{athlete.country}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">No country set</span>
                    )}
                  </div>
                  {athlete.selected_leagues && athlete.selected_leagues.length > 0 ? (
                    <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                      {athlete.selected_leagues.map((league) => (
                        <span
                          key={league}
                          className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium capitalize text-foreground"
                        >
                          {league}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>

            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">Current rank</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {rank != null ? `#${rank.toLocaleString()}` : '—'}
                </p>
              </article>
              <article className="rounded-lg border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">Total score</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </p>
              </article>
            </div>

            <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Connected Devices</h2>

              <div className="mt-4 space-y-3">
                {inDespiaWebView ? (
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
                        {appleConnected ? <ConnectedBadge /> : null}
                      </div>
                      {!appleConnected ? (
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
                      ) : null}
                    </div>
                    {appleConnected ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        There is no in-app disconnect for Apple. To change access, use iOS Settings {'>'} Privacy {'>'}{' '}
                        Health.
                      </p>
                    ) : null}
                  </div>
                ) : null}

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
                        onClick={() => {
                          const state = Math.random().toString(36).substring(2);
                          sessionStorage.setItem('whoop_oauth_state', state);
                          window.location.href = `${WHOOP_OAUTH_AUTHORIZE_BASE}&state=${state}`;
                        }}
                      >
                        Connect WHOOP
                      </Button>
                    )}
                  </div>
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

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" className="flex-1 font-semibold" disabled={syncing} onClick={() => void handleSync()}>
                {syncing ? 'Syncing…' : 'Sync workouts'}
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={() => void handleSignOut()}>
                Sign out
              </Button>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
