/**
 * Unread-message tracking in localStorage, backed up to Supabase user_metadata
 * so read state survives Despia WebView storage clears between sessions.
 */

import { supabase } from '@/services/supabase';

const PREFIX = 'rnkx:last_read:';
const SCOPE_KEY = 'rnkx:unread_scope_athlete';
const META_KEY = 'rnkx_chat_last_read';
/** Messages older than this with no read state are treated as read backlog, not new notifications. */
const UNREAD_STALE_MS = 3 * 24 * 60 * 60 * 1000;
export const UNREAD_CHANGED_EVENT = 'rnkx:unread-changed';

type ChatLastReadMap = Record<string, string>;

let syncTimer: ReturnType<typeof setTimeout> | null = null;

export function conversationUnreadKey(conversationId: string): string {
  return `convo-${conversationId}`;
}

function conversationIdFromKey(conversationKey: string): string | null {
  if (conversationKey.startsWith('convo-')) return conversationKey.slice('convo-'.length);
  if (conversationKey.startsWith('dm-') || conversationKey.startsWith('group-')) {
    return conversationKey.replace(/^(dm|group)-/, '');
  }
  return null;
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

function collectLocalChatLastReadMap(): ChatLastReadMap {
  const map: ChatLastReadMap = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (!storageKey?.startsWith(PREFIX)) continue;
      const conversationKey = storageKey.slice(PREFIX.length);
      if (!conversationKey.startsWith('convo-')) continue;
      const conversationId = conversationIdFromKey(conversationKey);
      const iso = localStorage.getItem(storageKey);
      if (conversationId && iso) map[conversationId] = iso;
    }
  } catch {
    /* ignore */
  }
  return map;
}

async function hydrateChatReadStateFromUser(): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const remote = user?.user_metadata?.[META_KEY] as ChatLastReadMap | undefined;
    if (!remote || typeof remote !== 'object') return;

    for (const [conversationId, iso] of Object.entries(remote)) {
      if (!conversationId || typeof iso !== 'string') continue;
      const key = conversationUnreadKey(conversationId);
      const remoteDate = new Date(iso);
      if (isNaN(remoteDate.getTime())) continue;
      const local = getLastRead(key);
      if (!local || remoteDate > local) {
        persistLastRead(key, iso, false);
      }
    }
  } catch {
    /* ignore */
  }
}

function scheduleSyncChatReadToServer(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void flushChatReadToServer();
  }, 400);
}

async function flushChatReadToServer(): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const local = collectLocalChatLastReadMap();
    const remote = (user.user_metadata?.[META_KEY] as ChatLastReadMap | undefined) ?? {};
    const merged: ChatLastReadMap = { ...remote };

    for (const [conversationId, iso] of Object.entries(local)) {
      const remoteIso = merged[conversationId];
      if (!remoteIso || new Date(iso) > new Date(remoteIso)) {
        merged[conversationId] = iso;
      }
    }

    const entries = Object.entries(merged).sort(
      (a, b) => new Date(b[1]).getTime() - new Date(a[1]).getTime(),
    );
    const capped = Object.fromEntries(entries.slice(0, 200));

    await supabase.auth.updateUser({ data: { [META_KEY]: capped } });
  } catch {
    /* ignore */
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

/** Hydrate local read markers from the server before counting unread conversations. */
export async function prepareUnreadStateForAthlete(athleteId: string): Promise<void> {
  ensureUnreadScopeForAthlete(athleteId);
  await hydrateChatReadStateFromUser();
}

export function notifyUnreadStateChanged(): void {
  try {
    window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
  } catch {
    /* ignore */
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

    scheduleSyncChatReadToServer();

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

export function markConversationReadAt(conversationKey: string, iso: string): void {
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
      markConversationReadAt(conversationKey, lastMessageAt);
      return false;
    }
    return true;
  }
  return msgDate > lastRead;
}
