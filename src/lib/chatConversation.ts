import { supabase } from '@/services/supabase';

/** Find or create a 1:1 conversation (is_group = false) between two athletes. */
export async function getOrCreateDmConversation(
  myAthleteId: string,
  friendAthleteId: string,
): Promise<{ conversationId: string | null; error: string | null }> {
  await supabase.rpc('ensure_athlete_user_id', { p_athlete_id: myAthleteId });

  const { data, error } = await supabase.rpc('get_or_create_dm_conversation', {
    p_my_athlete_id: myAthleteId,
    p_friend_athlete_id: friendAthleteId,
  });

  if (error) {
    return { conversationId: null, error: error.message };
  }

  const conversationId = typeof data === 'string' ? data : null;
  if (!conversationId) {
    return { conversationId: null, error: 'Could not start conversation' };
  }

  return { conversationId, error: null };
}
