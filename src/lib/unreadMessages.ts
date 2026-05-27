/**
 * Lightweight unread-message tracking using localStorage.
 *
 * Each conversation stores the ISO timestamp of the last message
 * the user has *seen* (i.e. opened the thread).  A conversation is
 * "unread" when its latest message was sent after that timestamp.
 */

const PREFIX = 'rnkx:last_read:';

export function markConversationRead(conversationKey: string): void {
  try {
    localStorage.setItem(PREFIX + conversationKey, new Date().toISOString());
  } catch {
    /* ignore storage errors */
  }
}

export function getLastRead(conversationKey: string): Date | null {
  try {
    const raw = localStorage.getItem(PREFIX + conversationKey);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function isUnread(conversationKey: string, lastMessageAt: string | null): boolean {
  if (!lastMessageAt) return false;
  const msgDate = new Date(lastMessageAt);
  if (isNaN(msgDate.getTime())) return false;
  const lastRead = getLastRead(conversationKey);
  if (!lastRead) return true; // never opened
  return msgDate > lastRead;
}
