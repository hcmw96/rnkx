/**
 * Lightweight unread-message tracking using localStorage.
 *
 * Each conversation stores the ISO timestamp of the last message the user has
 * seen (opened the thread). A conversation is unread when its latest message
 * is newer than that timestamp.
 *
 * Keys use `convo-{conversationId}`; legacy `dm-` / `group-` keys are read for
 * backward compatibility.
 */

const PREFIX = 'rnkx:last_read:';
export const UNREAD_CHANGED_EVENT = 'rnkx:unread-changed';

export function conversationUnreadKey(conversationId: string): string {
  return `convo-${conversationId}`;
}

function readTimestamp(key: string): Date | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function markConversationRead(conversationKey: string): void {
  try {
    const now = new Date().toISOString();
    localStorage.setItem(PREFIX + conversationKey, now);

    if (conversationKey.startsWith('convo-')) {
      const id = conversationKey.slice('convo-'.length);
      localStorage.setItem(PREFIX + `dm-${id}`, now);
      localStorage.setItem(PREFIX + `group-${id}`, now);
    }

    window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
  } catch {
    /* ignore storage errors */
  }
}

export function getLastRead(conversationKey: string): Date | null {
  const keys = [conversationKey];
  if (conversationKey.startsWith('convo-')) {
    const id = conversationKey.slice('convo-'.length);
    keys.push(`dm-${id}`, `group-${id}`);
  } else if (conversationKey.startsWith('dm-') || conversationKey.startsWith('group-')) {
    const id = conversationKey.replace(/^(dm|group)-/, '');
    keys.push(conversationUnreadKey(id));
  }

  let latest: Date | null = null;
  for (const key of keys) {
    const d = readTimestamp(key);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

export function isUnread(
  conversationKey: string,
  lastMessageAt: string | null,
  options?: { myAthleteId?: string | null; lastMessageAthleteId?: string | null },
): boolean {
  if (!lastMessageAt) return false;

  const myId = options?.myAthleteId?.trim();
  const senderId = options?.lastMessageAthleteId?.trim();
  if (myId && senderId && myId === senderId) {
    return false;
  }

  const msgDate = new Date(lastMessageAt);
  if (isNaN(msgDate.getTime())) return false;
  const lastRead = getLastRead(conversationKey);
  if (!lastRead) return true;
  return msgDate > lastRead;
}
