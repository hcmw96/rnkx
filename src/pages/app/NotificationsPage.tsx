import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, MessageCircle, UserPlus, Users, X } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { invokePushNotify } from '@/lib/pushNotify';
import { isPushRegistered, registerPushForAthlete } from '@/services/onesignal';
import { supabase } from '@/services/supabase';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { conversationUnreadKey, isUnread } from '@/lib/unreadMessages';
import { formatDistanceToNow } from 'date-fns';

type FriendRequestItem = {
  id: string;
  username: string;
  avatarUrl: string | null;
};

type UnreadChatItem = {
  id: string;
  name: string;
  preview: string;
  at: string;
  link: string;
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
  const [unreadChats, setUnreadChats] = useState<UnreadChatItem[]>([]);
  const [pushRegistered, setPushRegistered] = useState<boolean | null>(null);
  const [pushRegistering, setPushRegistering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setFriendRequests([]);
      setUnreadChats([]);
      setLoading(false);
      return;
    }

    const aid = await resolveAthleteId(user.id);
    if (!aid) {
      setAthleteId(null);
      setFriendRequests([]);
      setClubInvites([]);
      setUnreadChats([]);
      setLoading(false);
      return;
    }
    setAthleteId(aid);
    void isPushRegistered().then(setPushRegistered);

    const [{ data: incRows }, { data: memberships }, { data: pendingClubRows }] = await Promise.all([
      supabase
        .from('friendships')
        .select('id, athlete_id')
        .eq('friend_id', aid)
        .eq('status', 'pending'),
      supabase.from('conversation_members').select('conversation_id').eq('athlete_id', aid),
      supabase.from('private_league_members').select('league_id').eq('athlete_id', aid).eq('status', 'pending'),
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

    const convoIds = (memberships ?? []).map((m) => m.conversation_id as string);
    if (!convoIds.length) {
      setUnreadChats([]);
      setLoading(false);
      return;
    }

    const { data: msgs } = await supabase
      .from('conversation_messages')
      .select('conversation_id, athlete_id, content, created_at')
      .in('conversation_id', convoIds)
      .neq('athlete_id', aid)
      .order('created_at', { ascending: false });

    const latestByConv = new Map<
      string,
      { content: string; created_at: string }
    >();
    for (const m of msgs ?? []) {
      const cid = m.conversation_id as string;
      if (!latestByConv.has(cid)) {
        latestByConv.set(cid, {
          content: (m.content as string) || 'New message',
          created_at: m.created_at as string,
        });
      }
    }

    const unreadConvIds = [...latestByConv.entries()]
      .filter(([cid, meta]) => isUnread(conversationUnreadKey(cid), meta.created_at))
      .map(([cid]) => cid);

    if (!unreadConvIds.length) {
      setUnreadChats([]);
      setLoading(false);
      return;
    }

    const [{ data: dmRows }, { data: convos }] = await Promise.all([
      supabase.rpc('list_dm_inbox', { p_athlete_id: aid }),
      supabase.from('conversations').select('id, name, is_group').in('id', unreadConvIds),
    ]);

    const dmByConvo = new Map<string, { name: string; link: string }>();
    for (const row of (Array.isArray(dmRows) ? dmRows : []) as Record<string, unknown>[]) {
      const cid = String(row.conversation_id ?? '');
      const fid = String(row.friend_id ?? '');
      if (!cid || !fid) continue;
      dmByConvo.set(cid, {
        name: String(row.friend_username ?? 'Direct message'),
        link: `/app/chat/${fid}`,
      });
    }

    const convoMeta = new Map((convos ?? []).map((c) => [c.id as string, c]));

    setUnreadChats(
      unreadConvIds.map((cid) => {
        const dm = dmByConvo.get(cid);
        const conv = convoMeta.get(cid);
        const latest = latestByConv.get(cid)!;
        if (dm) {
          return {
            id: cid,
            name: dm.name,
            preview: latest.content,
            at: latest.created_at,
            link: dm.link,
          };
        }
        return {
          id: cid,
          name: conv?.name || 'Group chat',
          preview: latest.content,
          at: latest.created_at,
          link: `/app/chat/group/${cid}`,
        };
      }),
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
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
          url: `https://rnkx.netlify.app/app/leagues/${acceptedInvite.leagueId}`,
        });
      }
      setClubInvites((prev) => prev.filter((c) => c.leagueId !== leagueId));
    } catch (err) {
      console.warn('[notifications] accept club invite failed', err);
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
          url: `https://rnkx.netlify.app/app/leagues/${declinedInvite.leagueId}`,
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

  const empty = !loading && friendRequests.length === 0 && clubInvites.length === 0 && unreadChats.length === 0;
  const showPushBanner = pushRegistered === false && typeof window !== 'undefined' && !!(window as Window & { despia?: unknown }).despia;

  async function enablePush() {
    if (!athleteId || pushRegistering) return;
    setPushRegistering(true);
    try {
      await registerPushForAthlete(athleteId);
      setPushRegistered(await isPushRegistered());
    } finally {
      setPushRegistering(false);
    }
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-lg space-y-6">
        <div className="space-y-1">
          <h1 className="type-page-title">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Messages and friend requests. Workout and rank alerts are sent to your device when push is enabled.
          </p>
        </div>

        {showPushBanner ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
            <p className="text-sm font-medium">Push notifications are off</p>
            <p className="text-xs text-muted-foreground">
              Enable alerts for messages, friend requests, and club invites on this device.
            </p>
            <Button type="button" size="sm" disabled={pushRegistering} onClick={() => void enablePush()}>
              {pushRegistering ? 'Enabling…' : 'Enable push notifications'}
            </Button>
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
              <Button type="button" variant="outline" className="border-border" disabled={pushRegistering} onClick={() => void enablePush()}>
                Enable push notifications
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

            {unreadChats.length > 0 ? (
              <div className="space-y-2">
                <h2 className="type-section-label">Unread messages</h2>
                <ul className="space-y-2">
                  {unreadChats.map((chat) => (
                    <li key={chat.id}>
                      <Link
                        to={chat.link}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-muted-foreground/50"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <MessageCircle className="h-5 w-5 text-primary" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="type-heading truncate">{chat.name}</p>
                          <p className="type-meta truncate">{chat.preview}</p>
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
    </AppShell>
  );
}
