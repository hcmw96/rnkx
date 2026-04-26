import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { getCountryByName } from '@/data/countries';
import { fetchRecentWorkouts } from '@/services/despia';
import { supabase } from '@/services/supabase';

const ATHLETE_COLUMNS = 'id,username,display_name,country,avatar_url,total_score,selected_leagues';

interface AthleteRow {
  id: string;
  username: string | null;
  display_name: string;
  country: string | null;
  avatar_url: string | null;
  total_score: number | string | null;
  selected_leagues: string[] | null;
}

function numScore(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v);
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

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      toast.error(authErr?.message ?? 'Not signed in.');
      setAthlete(null);
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
    } else {
      setAthlete(athleteRow);
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
      body: { workouts: syncData.workouts },
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

  const countryInfo = athlete?.country ? getCountryByName(athlete.country) : null;
  const score = athlete ? numScore(athlete.total_score) : 0;
  const initials = athlete ? twoLetterAvatar(athlete.username, athlete.display_name) : '??';

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
