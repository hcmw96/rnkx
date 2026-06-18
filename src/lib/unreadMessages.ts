/**
 * Lightweight unread-message tracking using localStorage.
 *
 * Each conversation stores the ISO timestamp of the last message the user has
 * seen (opened the thread). A conversation is unread when its latest message
 * is newer than that timestamp. Threads with no read state and a last message
 * older than seven days are auto-marked read so stale DMs don't flood badges.
 *
 * Keys use `convo-{conversationId}`; legacy `dm-` / `group-` keys are read for
 * backward compatibility.
 */

const PREFIX = 'rnkx:last_read:';
const SCOPE_KEY = 'rnkx:unread_scope_athlete';
/** Messages older than this with no read state are treated as read backlog, not new notifications. */
const UNREAD_STALE_MS = 7 * 24 * 60 * 60 * 1000;
export const UNREAD_CHANGED_EVENT = 'rnkx:unread-changed';

export function conversationUnreadKey(conversationId: string): string {
  return `convo-${conversationId}`;
}

function clearUnreadReadState(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) toRemove.push(key);
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore storage errors */
  }
}

/** Drop read markers when a different athlete signs in on this device. */
export function ensureUnreadScopeForAthlete(athleteId: string): void {
  try {
    const prev = localStorage.getItem(SCOPE_KEY);
    if (prev && prev !== athleteId) {
      clearUnreadReadState();
    }
    localStorage.setItem(SCOPE_KEY, athleteId);
  } catch {
    /* ignore storage errors */
  }
}

export function notifyUnreadStateChanged(): void {
  try {
    window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
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

function persistLastRead(conversationKey: string, iso: string, notify: boolean): void {
  try {
    localStorage.setItem(PREFIX + conversationKey, iso);

    if (conversationKey.startsWith('convo-')) {
      const id = conversationKey.slice('convo-'.length);
      localStorage.setItem(PREFIX + `dm-${id}`, iso);
      localStorage.setItem(PREFIX + `group-${id}`, iso);
    }

    if (notify) {
      window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
    }
  } catch {
    /* ignore storage errors */
  }
}

export function markConversationRead(conversationKey: string): void {
  persistLastRead(conversationKey, new Date().toISOString(), true);
}

function markConversationReadAt(conversationKey: string, iso: string): void {
  persistLastRead(conversationKey, iso, false);
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
  if (!lastRead) {
    if (Date.now() - msgDate.getTime() > UNREAD_STALE_MS) {
      // Backlog from before we tracked reads (or after storage reset) — don't alert.
      markConversationReadAt(conversationKey, lastMessageAt);
      return false;
    }
    return true;
  }
  return msgDate > lastRead;
}
