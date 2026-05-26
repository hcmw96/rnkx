import { supabase } from '@/services/supabase';

export type ChatMessageRow = {
  id: string;
  athlete_id: string;
  content: string;
  created_at: string;
};

type RpcMessageRow = {
  id?: string;
  athlete_id?: string;
  content?: string | null;
  body?: string | null;
  created_at?: string;
};

/** Realtime payloads may use content or legacy body. */
export function chatMessageText(msg: { content?: string | null; body?: string | null }): string {
  return (msg.content ?? msg.body ?? '').trim();
}

function normalizeChatMessageRow(row: RpcMessageRow | null | undefined): ChatMessageRow | null {
  if (!row?.id || !row.athlete_id || !row.created_at) return null;
  return {
    id: row.id,
    athlete_id: row.athlete_id,
    content: chatMessageText(row),
    created_at: row.created_at,
  };
}

export async function sendConversationMessage(
  conversationId: string,
  athleteId: string,
  content: string,
): Promise<{ message: ChatMessageRow | null; error: string | null }> {
  const trimmed = content.trim();
  const { data, error } = await supabase.rpc('send_conversation_message', {
    p_conversation_id: conversationId,
    p_athlete_id: athleteId,
    p_content: trimmed,
  });

  if (error) {
    return { message: null, error: error.message };
  }

  const raw = Array.isArray(data) ? data[0] : data;
  const message = normalizeChatMessageRow(raw as RpcMessageRow | undefined);
  if (message) {
    return { message, error: null };
  }

  // RPC may have inserted but PostgREST returned an empty/mismatched row — recover from list.
  const { messages, error: listErr } = await listConversationMessages(conversationId, 30);
  if (!listErr) {
    const recent = [...messages]
      .reverse()
      .find((m) => m.athlete_id === athleteId && m.content === trimmed);
    if (recent) {
      return { message: recent, error: null };
    }
  }

  return {
    message: null,
    error: 'Could not send message. Update the app and try again.',
  };
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

  const rows = (Array.isArray(data) ? data : []) as RpcMessageRow[];
  const messages = rows
    .map((row) => normalizeChatMessageRow(row))
    .filter((row): row is ChatMessageRow => row !== null);

  return { messages, error: null };
}
