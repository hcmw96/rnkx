/** In-app support inbox is Shaun Smith's athlete row (`athletes.username`). */
export const SUPPORT_INBOX_USERNAME = 'shaunsmith';

export function isSupportInboxUsername(username: string | null | undefined): boolean {
  return (username ?? '').trim().toLowerCase() === SUPPORT_INBOX_USERNAME;
}
