import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, MessageCircle, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchChatNotifications } from '@/lib/chatInboxNotifications';
import { fetchPushSubscriptionStatus } from '@/lib/checkPushSubscription';
import { invokePushNotify } from '@/lib/pushNotify';
import {
  checkNativePushEnabled,
  isDespiaNative,
  isPushRegistered,
  openNotificationSettings,
  registerPushForAthlete,
  requestNotificationPermission,
} from '@/services/onesignal';
import { supabase } from '@/services/supabase';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { UNREAD_CHANGED_EVENT } from '@/lib/unreadMessages';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

type ChatNotificationItem = {
  id: string;
  name: string;
  preview: string;
  at: string;
  link: string;
  isRead: boolean;
};

type FriendRequestItem = {
  id: string;
  username: string;
  avatarUrl: string | null;
};

type ClubInviteItem = {
  leagueId: string;
  leagueName: string;
  imageUrl: string | null;
  createdBy: string | null;
};

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [acceptingLeagueId, setAcceptingLeagueId] = useState<string | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequestItem[]>([]);
  const [clubInvites, setClubInvites] = useState<ClubInviteItem[]>([]);
  const [chatNotifications, setChatNotifications] = useState<ChatNotificationItem[]>([]);
  const [pushRegistered, setPushRegistered] = useState<boolean | null>(null);
  const [pushLinked, setPushLinked] = useState<boolean | null>(null);
  const [pushRegistering, setPushRegistering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setFriendRequests([]);
      setChatNotifications([]);
      setLoading(false);
      return;
    }

    const aid = await resolveAthleteId(user.id);
    if (!aid) {
      setAthleteId(null);
      setFriendRequests([]);
      setClubInvites([]);
      setChatNotifications([]);
      setLoading(false);
      return;
    }
    setAthleteId(aid);
    const [permissionEnabled, linkStatus] = await Promise.all([
      isPushRegistered(),
      fetchPushSubscriptionStatus(aid),
    ]);
    setPushRegistered(permissionEnabled);
    setPushLinked(linkStatus?.linked ?? null);

    const [{ data: incRows }, { data: pendingClubRows }, chatItems] = await Promise.all([
      supabase
        .from('friendships')
        .select('id, athlete_id')
        .eq('friend_id', aid)
        .eq('status', 'pending'),
      supabase.from('private_league_members').select('league_id').eq('athlete_id', aid).eq('status', 'pending'),
      fetchChatNotifications(aid),
    ]);

    const requesterIds = [...new Set((incRows ?? []).map((r) => r.athlete_id as string))];
    let requesterMap = new Map<string, { username: string | null; avatar_url: string | null }>();
    if (requesterIds.length) {
      const { data: athletes } = await supabase
        .from('athletes')
        .select('id, username, avatar_url')
        .in('id', requesterIds);
      requesterMap = new Map(
        (athletes ?? []).map((a) => [
          a.id as string,
          { username: a.username as string | null, avatar_url: a.avatar_url as string | null },
        ]),
      );
    }

    setFriendRequests(
      (incRows ?? []).map((r) => {
        const a = requesterMap.get(r.athlete_id as string);
        return {
          id: r.id as string,
          username: a?.username?.trim() || 'Athlete',
          avatarUrl: a?.avatar_url ?? null,
        };
      }),
    );

    const pendingLeagueIds = [...new Set((pendingClubRows ?? []).map((r) => r.league_id as string))];
    if (pendingLeagueIds.length) {
      const { data: leagues } = await supabase
        .from('private_leagues')
        .select('id, name, image_url, created_by')
        .in('id', pendingLeagueIds);
      const leagueMap = new Map((leagues ?? []).map((l) => [String(l.id), l]));
      setClubInvites(
        pendingLeagueIds.map((leagueId) => {
          const l = leagueMap.get(leagueId) as
            | { id?: string; name?: string; image_url?: string | null; created_by?: string | null }
            | undefined;
          return {
            leagueId,
            leagueName: (l?.name as string) || 'Club invitation',
            imageUrl: (l?.image_url as string | null) ?? null,
            createdBy: (l?.created_by as string | null) ?? null,
          };
        }),
      );
    } else {
      setClubInvites([]);
    }

    setChatNotifications(chatItems);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(UNREAD_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(UNREAD_CHANGED_EVENT, refresh);
  }, [load]);

  const acceptClubInvite = async (leagueId: string) => {
    if (!athleteId || acceptingLeagueId) return;
    setAcceptingLeagueId(leagueId);
    try {
      const { error } = await supabase.rpc('add_member_to_club', {
        p_league_id: leagueId,
        p_athlete_id: athleteId,
      });
      if (error) {
        throw error;
      }
      const acceptedInvite = clubInvites.find((c) => c.leagueId === leagueId);
      if (acceptedInvite?.createdBy && acceptedInvite.createdBy !== athleteId) {
        invokePushNotify('send-notification', {
          athlete_id: acceptedInvite.createdBy,
          title: 'Club invite accepted',
          message: `Someone accepted your invite to ${acceptedInvite.leagueName}.`,
          path: `/app/leagues/${acceptedInvite.leagueId}`,
        });
      }
      setClubInvites((prev) => prev.filter((c) => c.leagueId !== leagueId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not join club';
      toast.error(msg);
    } finally {
      setAcceptingLeagueId(null);
      void load();
    }
  };

  const declineClubInvite = async (leagueId: string) => {
    if (!athleteId || acceptingLeagueId) return;
    setAcceptingLeagueId(leagueId);
    try {
      const { error } = await supabase
        .from('private_league_members')
        .update({ status: 'declined' })
        .eq('league_id', leagueId)
        .eq('athlete_id', athleteId)
        .eq('status', 'pending');

      if (error) {
        throw error;
      }

      const declinedInvite = clubInvites.find((c) => c.leagueId === leagueId);
      if (declinedInvite?.createdBy && declinedInvite.createdBy !== athleteId) {
        invokePushNotify('send-notification', {
          athlete_id: declinedInvite.createdBy,
          title: 'Club invite declined',
          message: `An invite to ${declinedInvite.leagueName} was declined.`,
          path: `/app/leagues/${declinedInvite.leagueId}`,
        });
      }

      setClubInvites((prev) => prev.filter((c) => c.leagueId !== leagueId));
    } catch (err) {
      console.warn('[notifications] decline club invite failed', err);
    } finally {
      setAcceptingLeagueId(null);
      void load();
    }
  };

  const unreadChatNotifications = chatNotifications.filter((c) => !c.isRead);
  const unreadChatCount = unreadChatNotifications.length;
  const empty =
    !loading &&
    friendRequests.length === 0 &&
    clubInvites.length === 0 &&
    unreadChatCount === 0;
  const showPushBanner =
    isDespiaNative() && (pushRegistered === false || pushLinked === false);
  const pushBannerNeedsLink = pushRegistered === true && pushLinked === false;

  async function refreshPushLinkStatus(id: string) {
    const linkStatus = await fetchPushSubscriptionStatus(id);
    setPushLinked(linkStatus?.linked ?? null);
    return linkStatus;
  }

  async function enablePush(openSettingsIfNeeded = true) {
    if (!athleteId || pushRegistering) return;
    setPushRegistering(true);
    try {
      await registerPushForAthlete(athleteId);
      let enabled = await checkNativePushEnabled();
      if (!enabled) {
        await requestNotificationPermission();
        enabled = await checkNativePushEnabled();
      }
      if (!enabled && openSettingsIfNeeded) {
        openNotificationSettings();
      }
      setPushRegistered(enabled === true);
      if (enabled) {
        await refreshPushLinkStatus(athleteId);
      }
    } finally {
      setPushRegistering(false);
    }
  }

  return (
    <section className="mx-auto max-w-lg space-y-6">
        <div className="space-y-1">
          <h1 className="type-page-title">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Messages and friend requests. Workout and rank alerts are sent to your device when push is enabled.
          </p>
        </div>

        {showPushBanner ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
            <p className="text-sm font-medium">
              {pushBannerNeedsLink ? 'Push is on, but this device is not linked' : 'Push notifications are off'}
            </p>
            <p className="text-xs text-muted-foreground">
              {pushBannerNeedsLink
                ? 'Tap below to re-link this phone to your RNKX account so workout, message, and rank alerts can reach you.'
                : 'Enable alerts for messages, friend requests, workout scores, and club invites on this device.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={pushRegistering} onClick={() => void enablePush(true)}>
                {pushRegistering ? 'Enabling…' : pushBannerNeedsLink ? 'Link this device' : 'Enable notifications'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pushRegistering}
                onClick={() => openNotificationSettings()}
              >
                Open Settings
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : empty ? (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
              <Bell className="h-8 w-8 text-neon-lime" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
            {showPushBanner ? (
              <Button type="button" variant="outline" className="border-border" disabled={pushRegistering} onClick={() => void enablePush(true)}>
                Enable notifications
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-6">
            {friendRequests.length > 0 ? (
              <div className="space-y-2">
                <h2 className="type-section-label">Friend requests</h2>
                <ul className="space-y-2">
                  {friendRequests.map((req) => (
                    <li key={req.id}>
                      <Link
                        to="/app/social/friends"
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-muted-foreground/50"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <UserPlus className="h-5 w-5 text-primary" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="type-heading truncate">{req.username}</p>
                          <p className="type-meta">Wants to be friends</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {clubInvites.length > 0 ? (
              <div className="space-y-2">
                <h2 className="type-section-label">Club invites</h2>
                <ul className="space-y-2">
                  {clubInvites.map((invite) => (
                    <li key={invite.leagueId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted">
                        {invite.imageUrl ? (
                          <img src={invite.imageUrl} alt={invite.leagueName} className="h-full w-full object-cover" />
                        ) : (
                          <Users className="h-5 w-5 text-primary" aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="type-heading truncate">{invite.leagueName}</p>
                        <p className="type-meta">Invited you to join</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          disabled={acceptingLeagueId === invite.leagueId}
                          onClick={() => void declineClubInvite(invite.leagueId)}
                          aria-label="Decline club invite"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 gap-1.5"
                          disabled={acceptingLeagueId === invite.leagueId}
                          onClick={() => void acceptClubInvite(invite.leagueId)}
                        >
                          <Check className="h-3.5 w-3.5" />
                          {acceptingLeagueId === invite.leagueId ? 'Joining…' : 'Accept'}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {unreadChatCount > 0 ? (
              <div className="space-y-2">
                <h2 className="type-section-label">Messages ({unreadChatCount} unread)</h2>
                <ul className="space-y-2">
                  {unreadChatNotifications.map((chat) => (
                    <li key={chat.id}>
                      <Link
                        to={chat.link}
                        aria-label={`${chat.preview}, unread`}
                        className="flex items-center gap-3 rounded-lg border border-primary/40 bg-card p-3 transition-colors hover:border-primary/60"
                      >
                        <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <MessageCircle className="h-5 w-5 text-primary" aria-hidden />
                          <span
                            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card"
                            aria-hidden
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="type-heading truncate">{chat.preview}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(chat.at), { addSuffix: true })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>
  );
}
