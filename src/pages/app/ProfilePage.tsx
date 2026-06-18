import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ProfileOverviewCard, ProfileProgressCard } from '@/components/profile/ProfileSections';
import { getCountryByName } from '@/data/countries';
import { fetchAchievementStates, type AchievementState } from '@/lib/achievements';
import {
  fetchProfileCareerStats,
  fetchProfileSeasonStats,
  fetchSeasonStanding,
  type ProfileCareerStats,
  type ProfileSeasonStats,
} from '@/lib/profileStats';
import { leagueFromSelectedLeagues } from '@/lib/leagueAvatars';
import { getProfileCache, setProfileCache } from '@/lib/routeCaches';
import { supabase } from '@/services/supabase';

const ATHLETE_COLUMNS =
  'id, username, display_name, country, avatar_url, total_score, created_at, is_premium, selected_leagues';

interface AthleteRow {
  id: string;
  username: string | null;
  display_name: string;
  country: string | null;
  avatar_url: string | null;
  total_score: number | string | null;
  created_at: string | null;
  is_premium: boolean | null;
  selected_leagues: string[] | null;
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
  const cached = getProfileCache();
  const [athlete, setAthlete] = useState<AthleteRow | null>((cached?.athlete as AthleteRow | null) ?? null);
  const [seasonStats, setSeasonStats] = useState<ProfileSeasonStats | null>(
    (cached?.seasonStats as ProfileSeasonStats | null) ?? null,
  );
  const [careerStats, setCareerStats] = useState<ProfileCareerStats | null>(
    (cached?.careerStats as ProfileCareerStats | null) ?? null,
  );
  const [standingPercent, setStandingPercent] = useState(cached?.standingPercent ?? 50);
  const [topPercent, setTopPercent] = useState(cached?.topPercent ?? 50);
  const [achievements, setAchievements] = useState<AchievementState[]>(
    (cached?.achievements as AchievementState[]) ?? [],
  );
  const [loading, setLoading] = useState(!cached);
  const [uploading, setUploading] = useState(false);

  const loadProfile = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
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
    void loadProfile({ silent: !!getProfileCache() });
  }, [loadProfile]);

  useEffect(() => {
    if (loading) return;
    setProfileCache({
      athlete,
      seasonStats,
      careerStats,
      standingPercent,
      topPercent,
      achievements,
    });
  }, [loading, athlete, seasonStats, careerStats, standingPercent, topPercent, achievements]);

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

    const { error: linkErr } = await supabase.rpc('ensure_athlete_user_id', {
      p_athlete_id: athlete.id,
    });
    if (linkErr) {
      toast.error(linkErr.message);
      setUploading(false);
      return;
    }

    const path = `${athlete.id}/avatar.jpg`;

    // Remove stale object so upload succeeds even if storage UPDATE policy is missing.
    await supabase.storage.from('avatars').remove([path]);

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
    const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`;
    const { error: updateError } = await supabase
      .from('athletes')
      .update({ avatar_url: avatarUrl })
      .eq('id', athlete.id);

    if (updateError) {
      toast.error(updateError.message);
      setUploading(false);
      return;
    }

    setAthlete((prev) => (prev ? { ...prev, avatar_url: avatarUrl } : prev));
    toast.success('Profile photo updated.');
    setUploading(false);
  };

  const avatarLeague = leagueFromSelectedLeagues(athlete?.selected_leagues);
  const countryMeta = athlete?.country ? getCountryByName(athlete.country) : null;
  const countryName = countryMeta?.name ?? athlete?.country ?? null;
  const countryFlag = countryMeta?.flag ?? '';
  const engineScore = seasonStats?.engineScore ?? 0;
  const runScore = seasonStats?.runScore ?? 0;
  const combinedScore = engineScore + runScore;

  return (
    <section className="mx-auto max-w-lg space-y-4 pb-8">
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
            <ProfileOverviewCard
              displayName={athlete.display_name}
              username={athlete.username}
              isPremium={athlete.is_premium}
              countryName={countryName}
              countryFlag={countryFlag}
              memberSince={memberSinceLabel(athlete.created_at)}
              avatarUrl={athlete.avatar_url}
              avatarLeague={avatarLeague}
              uploading={uploading}
              onAvatarClick={openAvatarPicker}
              seasonDisplay={seasonStats?.seasonDisplay ?? 'Season 1 · Spring 2026'}
              combinedScore={combinedScore}
              engineScore={engineScore}
              runScore={runScore}
              standingPercent={standingPercent}
              topPercent={topPercent}
            />

            <ProfileProgressCard careerStats={careerStats} achievements={achievements} />
          </>
        )}
      </section>
  );
}
