import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, MessageCircle, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
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

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [friendRequests, setFriendRequests] = useState<FriendRequestItem[]>([]);
  const [unreadChats, setUnreadChats] = useState<UnreadChatItem[]>([]);

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
      setFriendRequests([]);
      setUnreadChats([]);
      setLoading(false);
      return;
    }

    const [{ data: incRows }, { data: memberships }] = await Promise.all([
      supabase
        .from('friendships')
        .select('id, athlete_id')
        .eq('friend_id', aid)
        .eq('status', 'pending'),
      supabase.from('conversation_members').select('conversation_id').eq('athlete_id', aid),
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

  const empty = !loading && friendRequests.length === 0 && unreadChats.length === 0;

  return (
    <AppShell>
      <section className="mx-auto max-w-lg space-y-6">
        <div className="space-y-1">
          <h1 className="type-page-title">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Messages and friend requests. Workout and rank alerts are sent to your device when push is enabled.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : empty ? (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
              <Bell className="h-8 w-8 text-neon-lime" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
            <Button type="button" variant="outline" className="border-border" asChild>
              <Link to="/app/profile">Push settings in Profile</Link>
            </Button>
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
