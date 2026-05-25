import { supabase } from '@/services/supabase';

export async function fetchAcceptedFriendIds(athleteId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('athlete_id, friend_id')
    .eq('status', 'accepted')
    .or(`athlete_id.eq.${athleteId},friend_id.eq.${athleteId}`);

  if (error) return [];

  return [...new Set((data ?? []).map((row) => (row.athlete_id === athleteId ? row.friend_id : row.athlete_id) as string))];
}
