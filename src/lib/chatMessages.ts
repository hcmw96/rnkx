import { supabase } from '@/services/supabase';

export type ChatMessageRow = {
  id: string;
  athlete_id: string;
  content: string;
  created_at: string;
};

/** Realtime payloads may use content or legacy body. */
export function chatMessageText(msg: { content?: string | null; body?: string | null }): string {
  return (msg.content ?? msg.body ?? '').trim();
}

export async function sendConversationMessage(
  conversationId: string,
  athleteId: string,
  content: string,
): Promise<{ message: ChatMessageRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('send_conversation_message', {
    p_conversation_id: conversationId,
    p_athlete_id: athleteId,
    p_content: content,
  });

  if (error) {
    return { message: null, error: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as ChatMessageRow | null | undefined;
  if (!row?.id) {
    return { message: null, error: 'Could not send message' };
  }

  return { message: row, error: null };
}

export async function listConversationMessages(
  conversationId: string,
  limit = 200,
): Promise<{ messages: ChatMessageRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('list_conversation_messages', {
    p_conversation_id: conversationId,
    p_limit: limit,
  });

  if (error) {
    return { messages: [], error: error.message };
  }

  return { messages: (data as ChatMessageRow[]) ?? [], error: null };
}
