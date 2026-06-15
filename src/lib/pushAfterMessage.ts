import { supabase } from '@/services/supabase';

import { invokePushNotify } from './pushNotify';

/** Client-side backup when DB pg_net invoke is unavailable (vault secret missing). */
export async function notifyConversationMessagePush(
  conversationId: string,
  senderAthleteId: string,
  messageBody: string,
): Promise<void> {
  const trimmed = messageBody.trim();
  if (!trimmed) return;

  const [{ data: convo }, { data: members }] = await Promise.all([
    supabase.from('conversations').select('is_group').eq('id', conversationId).maybeSingle(),
    supabase.from('conversation_members').select('athlete_id').eq('conversation_id', conversationId),
  ]);

  const isGroup = Boolean(convo?.is_group);

  if (isGroup) {
    invokePushNotify('notify-new-message', {
      conversation_id: conversationId,
      sender_athlete_id: senderAthleteId,
      message_body: trimmed,
    });
    return;
  }

  const memberCount = (members ?? []).length;
  if (memberCount !== 2) {
    invokePushNotify('notify-new-message', {
      conversation_id: conversationId,
      sender_athlete_id: senderAthleteId,
      message_body: trimmed,
    });
    return;
  }

  const receiver = (members ?? []).find((m) => m.athlete_id !== senderAthleteId)?.athlete_id;
  if (receiver) {
    invokePushNotify('notify-new-message', {
      receiver_athlete_id: receiver,
      sender_athlete_id: senderAthleteId,
      preview: trimmed,
    });
  }
}
