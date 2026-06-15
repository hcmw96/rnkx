import { loadDmInboxItems, loadGroupInboxItems } from '@/lib/chatInboxLoad';

export type ChatNotificationItem = {
  id: string;
  name: string;
  preview: string;
  at: string;
  link: string;
  isRead: boolean;
};

/** Same inbox sources as ChatPage — used for the Notifications messages section. */
export async function fetchChatNotifications(athleteId: string): Promise<ChatNotificationItem[]> {
  const [dmItems, groupItems] = await Promise.all([
    loadDmInboxItems(athleteId),
    loadGroupInboxItems(athleteId),
  ]);

  const all: ChatNotificationItem[] = [
    ...dmItems
      .filter((item) => item.unread && item.lastMessageAt !== new Date(0).toISOString())
      .map((item) => ({
        id: item.conversationId,
        name: item.name,
        preview: item.type === 'group' ? `New message in ${item.name}` : `New message from ${item.name}`,
        at: item.lastMessageAt,
        link: item.link,
        isRead: false,
      })),
    ...groupItems
      .filter((item) => item.unread && item.lastMessageAt !== new Date(0).toISOString())
      .map((item) => ({
        id: item.conversationId,
        name: item.name,
        preview: `New message in ${item.name}`,
        at: item.lastMessageAt,
        link: item.link,
        isRead: false,
      })),
  ];

  const seen = new Set<string>();
  const deduped = all.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  deduped.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return deduped.slice(0, 40);
}
