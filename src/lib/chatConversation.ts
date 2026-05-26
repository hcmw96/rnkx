import { supabase } from '@/services/supabase';

/** Find or create a 1:1 conversation (is_group = false) between two athletes. */
export async function getOrCreateDmConversation(
  myAthleteId: string,
  friendAthleteId: string,
): Promise<{ conversationId: string | null; error: string | null }> {
  const { data: myRows } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('athlete_id', myAthleteId);

  const myConvoIds = (myRows ?? []).map((r) => r.conversation_id as string);
  if (myConvoIds.length) {
    const { data: shared } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('athlete_id', friendAthleteId)
      .in('conversation_id', myConvoIds);

    for (const row of shared ?? []) {
      const cid = row.conversation_id as string;
      const { data: conv } = await supabase
        .from('conversations')
        .select('is_group')
        .eq('id', cid)
        .maybeSingle();
      if (conv?.is_group) continue;

      const { count } = await supabase
        .from('conversation_members')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', cid);
      if (count === 2) return { conversationId: cid, error: null };
    }
  }

  const { data: friend } = await supabase
    .from('athletes')
    .select('username, display_name')
    .eq('id', friendAthleteId)
    .maybeSingle();
  const label =
    (friend?.display_name as string | undefined)?.trim() ||
    (friend?.username as string | undefined)?.trim() ||
    'Chat';

  const { data: convRow, error: convErr } = await supabase
    .from('conversations')
    .insert({ is_group: false, name: label, created_by: myAthleteId })
    .select('id')
    .single();

  if (convErr || !convRow?.id) {
    return { conversationId: null, error: convErr?.message ?? 'Could not start conversation' };
  }

  const conversationId = convRow.id as string;

  const { error: selfErr } = await supabase
    .from('conversation_members')
    .insert({ conversation_id: conversationId, athlete_id: myAthleteId });
  if (selfErr) {
    return { conversationId: null, error: selfErr.message };
  }

  const { error: friendErr } = await supabase.from('conversation_members').insert({
    conversation_id: conversationId,
    athlete_id: friendAthleteId,
  });
  if (friendErr) {
    return { conversationId: null, error: friendErr.message };
  }

  return { conversationId, error: null };
}
