import { supabase } from '@/services/supabase';

const UPLOAD_TIMEOUT_MS = 25_000;

/** Upload a profile photo to `avatars/{athleteId}/avatar.jpg` and return the public URL. */
export async function uploadAthleteAvatar(
  athleteId: string,
  file: File,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const { error: linkErr } = await supabase.rpc('ensure_athlete_user_id', {
    p_athlete_id: athleteId,
  });
  if (linkErr) {
    return { publicUrl: null, error: linkErr.message };
  }

  const path = `${athleteId}/avatar.jpg`;
  await supabase.storage.from('avatars').remove([path]);

  const uploadPromise = supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) => {
    setTimeout(() => resolve({ error: { message: 'Upload timed out' } }), UPLOAD_TIMEOUT_MS);
  });

  const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
  if (uploadError) {
    return { publicUrl: null, error: uploadError.message };
  }

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  return { publicUrl: `${pub.publicUrl}?v=${Date.now()}`, error: null };
}
