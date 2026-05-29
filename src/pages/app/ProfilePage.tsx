import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Award, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { AppShell } from '@/components/app/AppShell';
import { getCountryByName } from '@/data/countries';
import { AchievementBadge } from '@/components/profile/AchievementBadge';
import { fetchAchievementStates, type AchievementState } from '@/lib/achievements';
import {
  fetchProfileCareerStats,
  fetchProfileSeasonStats,
  fetchSeasonStanding,
  type ProfileCareerStats,
  type ProfileSeasonStats,
} from '@/lib/profileStats';
import { cn } from '@/lib/utils';
import { supabase } from '@/services/supabase';

const ATHLETE_COLUMNS =
  'id, username, display_name, country, avatar_url, total_score, created_at, is_premium';

interface AthleteRow {
  id: string;
  username: string | null;
  display_name: string;
  country: string | null;
  avatar_url: string | null;
  total_score: number | string | null;
  created_at: string | null;
  is_premium: boolean | null;
}

// Feature flag: hide social card at launch
const SHOW_SOCIAL_CARD = false;

function twoLetterAvatar(username: string | null, displayName: string | null): string {
  const u = (username ?? '').trim();
  if (u.length >= 2) return u.slice(0, 2).toUpperCase();
  if (u.length === 1) return `${u}${(displayName ?? '?').charAt(0)}`.toUpperCase().slice(0, 2);
  const d = (displayName ?? '').trim();
  if (d.length >= 2) return d.slice(0, 2).toUpperCase();
  if (d.length === 1) return `${d}?`.toUpperCase();
  return '??';
}

function numScore(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function memberSinceLabel(createdAt: string | null | undefined): string {
  if (!createdAt) return 'Member since —';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return 'Member since —';
  return `Member since ${format(d, 'MMMM yyyy')}`;
}

export default function ProfilePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [athlete, setAthlete] = useState<AthleteRow | null>(null);
  const [seasonStats, setSeasonStats] = useState<ProfileSeasonStats | null>(null);
  const [careerStats, setCareerStats] = useState<ProfileCareerStats | null>(null);
  const [standingPercent, setStandingPercent] = useState(50);
  const [topPercent, setTopPercent] = useState(50);
  const [achievements, setAchievements] = useState<AchievementState[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) {
      toast.error(authErr?.message ?? 'Not signed in.');
      setAthlete(null);
      setSeasonStats(null);
      setCareerStats(null);
      setLoading(false);
      return;
    }

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
      setSeasonStats(null);
      setCareerStats(null);
      setLoading(false);
      return;
    }

    const row = athleteRow as AthleteRow;
    setAthlete(row);

    const allTime = numScore(row.total_score);
    const [season, career, standing] = await Promise.all([
      fetchProfileSeasonStats(row.id),
      fetchProfileCareerStats(row.id, allTime),
      fetchSeasonStanding(row.id),
    ]);
    const badgeStates = await fetchAchievementStates(row.id, season, career);
    setSeasonStats(season);
    setCareerStats(career);
    setStandingPercent(standing.standingPercent);
    setTopPercent(standing.topPercent);
    setAchievements(badgeStates);
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
    const { error: updateError } = await supabase
      .from('athletes')
      .update({ avatar_url: pub.publicUrl })
      .eq('id', athlete.id);

    if (updateError) {
      toast.error(updateError.message);
      setUploading(false);
      return;
    }

    setAthlete((prev) => (prev ? { ...prev, avatar_url: pub.publicUrl } : prev));
    toast.success('Profile photo updated.');
    setUploading(false);
  };

  const initials = athlete ? twoLetterAvatar(athlete.username, athlete.display_name) : '??';
  const countryMeta = athlete?.country ? getCountryByName(athlete.country) : null;
  const countryName = countryMeta?.name ?? athlete?.country ?? null;
  const countryFlag = countryMeta?.flag ?? '';
  const engineScore = seasonStats?.engineScore ?? 0;
  const runScore = seasonStats?.runScore ?? 0;
  const combinedScore = engineScore + runScore;

  return (
    <AppShell>
      <section className="mx-auto max-w-lg space-y-8 pb-8">
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
            {/* Section 1 — Identity */}
            <div className="flex flex-col items-center gap-3 text-center">
              <button
                type="button"
                onClick={openAvatarPicker}
                disabled={uploading}
                className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border-2 border-neon-lime/40 bg-muted transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
                  <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium">
                    …
                  </span>
                ) : null}
              </button>

              <div className="space-y-1">
                <h1 className="type-page-title">{athlete.display_name}</h1>
                <p className="text-sm text-neon-lime">@{athlete.username ?? '—'}</p>
                <p className="flex justify-center pt-0.5">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
                      athlete.is_premium
                        ? 'bg-neon-lime/20 text-neon-lime'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {athlete.is_premium ? 'Premium' : 'Free'}
                  </span>
                </p>
                {countryName ? (
                  <p className="text-sm text-muted-foreground">
                    {countryFlag ? `${countryFlag} ` : ''}
                    {countryName}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">{memberSinceLabel(athlete.created_at)}</p>
              </div>
            </div>

            {/* Section 2 — Social card (launch flag off) */}
            {SHOW_SOCIAL_CARD ? (
              <article className="rounded-xl border border-border bg-card p-5 opacity-60">
                <p className="type-section-label">Social</p>
                <p className="mt-2 text-sm text-muted-foreground">Coming Soon</p>
              </article>
            ) : null}

            {/* Section 3 — Season score */}
            <article className="space-y-4 rounded-xl border border-border bg-card p-5">
              <p className="type-section-label">{seasonStats?.seasonDisplay ?? 'Season 1 · Spring 2026'}</p>
              <p className="type-stat text-neon-lime">{combinedScore.toLocaleString()}</p>
              <p className="type-meta">Combined season score</p>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Season standing</span>
                  <span>Top {topPercent}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-neon-lime to-amber-400 transition-all"
                    style={{ width: `${standingPercent}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-border bg-zinc-950/60 px-3 py-1 text-xs font-medium text-foreground">
                  Engine: {engineScore.toLocaleString()} pts
                </span>
                <span className="rounded-full border border-border bg-zinc-950/60 px-3 py-1 text-xs font-medium text-foreground">
                  Run: {runScore.toLocaleString()} pts
                </span>
              </div>
            </article>

            {/* Section 4 — Career stats */}
            <article className="space-y-3">
              <h2 className="type-section-label">Career stats</h2>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Scored workouts"
                  value={String(careerStats?.totalScoredWorkouts ?? 0)}
                />
                <StatCard
                  label="All-time points"
                  value={(careerStats?.allTimePoints ?? 0).toLocaleString()}
                />
                <StatCard
                  label="Best session"
                  value={`${(careerStats?.bestSession ?? 0).toLocaleString()} pts`}
                />
                <StatCard label="Top activity" value={careerStats?.topActivityType ?? '—'} />
              </div>
            </article>

            {/* Section 5 — Achievements */}
            <article className="space-y-3">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-neon-lime" aria-hidden />
                <h2 className="type-section-label">Achievements</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Earn badges by hitting milestones. Locked badges show what to aim for next.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {achievements.map((badge) => (
                  <AchievementBadge key={badge.id} achievement={badge} />
                ))}
              </div>
            </article>

            <Link
              to="/app/settings"
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-neon-lime/40 hover:text-foreground"
            >
              <Settings className="h-4 w-4" aria-hidden />
              Account &amp; device settings
            </Link>
          </>
        )}
      </section>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-4">
      <p className="type-meta">{label}</p>
      <p className="mt-1 font-sans text-lg font-semibold tabular-nums leading-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

