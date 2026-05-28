import { supabase } from '@/services/supabase';

const UPLOAD_TIMEOUT_MS = 25_000;

export function clubImageDisplayUrl(imageUrl: string | null | undefined, cacheKey?: string): string | null {
  if (!imageUrl) return null;
  const key = cacheKey ?? imageUrl;
  const sep = imageUrl.includes('?') ? '&' : '?';
  return `${imageUrl}${sep}v=${encodeURIComponent(key)}`;
}

export async function uploadClubImageFile(
  athleteId: string,
  leagueId: string,
  file: File,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const ext =
    file.name.split('.').pop()?.toLowerCase() ||
    (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');
  const path = `${athleteId}/league-${leagueId}-${Date.now()}.${ext}`;

  const uploadPromise = supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
    cacheControl: '3600',
  });

  const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
    setTimeout(() => resolve({ error: { message: 'Upload timed out' } }), UPLOAD_TIMEOUT_MS);
  });

  const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
  if (uploadError) {
    return { publicUrl: null, error: uploadError.message };
  }

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  return { publicUrl: pub.publicUrl, error: null };
}

export async function saveClubImageUrl(
  leagueId: string,
  athleteId: string,
  imageUrl: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.rpc('update_private_club', {
    p_league_id: leagueId,
    p_athlete_id: athleteId,
    p_image_url: imageUrl,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}
