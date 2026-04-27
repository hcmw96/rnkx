import { toast } from 'sonner';

export const PENDING_LEAGUE_INVITE_SESSION_KEY = 'rnkx_pending_league_invite_code';

/** Path to resume a league invite after auth (e.g. `/join/abc123`), or null. */
export function getPendingLeagueInvitePath(): string | null {
  try {
    const c = sessionStorage.getItem(PENDING_LEAGUE_INVITE_SESSION_KEY)?.trim();
    if (c) return `/join/${encodeURIComponent(c)}`;
  } catch {
    /* ignore */
  }
  return null;
}

export async function shareLeagueInvite(leagueName: string, inviteCode: string): Promise<void> {
  const inviteUrl = `https://rnkx.netlify.app/join/${inviteCode}`;
  const shareData: ShareData = {
    title: 'Join my RNKX league',
    text: `Join "${leagueName}" on RNKX — the competitive fitness leaderboard. Tap to join:`,
    url: inviteUrl,
  };

  try {
    if (typeof navigator.share === 'function') {
      await navigator.share(shareData);
      return;
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    console.warn('[shareLeagueInvite] navigator.share failed', err);
  }

  try {
    await navigator.clipboard.writeText(inviteUrl);
    toast('Invite link copied to clipboard!');
  } catch (err) {
    console.warn('[shareLeagueInvite] clipboard failed', err);
    toast.error('Could not copy link. Please copy manually.');
  }
}
