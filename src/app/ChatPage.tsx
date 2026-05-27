import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";
import { ChatPremiumGate } from "@/components/chat/ChatPremiumGate";
import { NewMessageModal } from "@/components/chat/NewMessageModal";
import { supabase } from "@/services/supabase";
import { resolveAthleteId } from "@/lib/resolveAthleteId";
import { getOrCreateDmConversation } from "@/lib/chatConversation";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Users, PenSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { toast } from "sonner";
import { isUnread } from "@/lib/unreadMessages";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface ChatItem {
  id: string;
  type: "dm" | "group";
  name: string;
  avatar: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: boolean;
  link: string;
  conversationId?: string;
  friendId?: string;
}

export default function ChatPage() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const navigate = useNavigate();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const itemsRef = useRef<ChatItem[]>([]);
  itemsRef.current = items;

  const loadAll = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const aid = await resolveAthleteId(user.id);
      if (!aid) return;
      setAthleteId(aid);

      const [dmItems, groupItems] = await Promise.all([
        loadDMs(aid),
        loadGroupChats(aid),
      ]);

      const all = [...dmItems, ...groupItems].sort(
        (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      );
      setItems(all);
    } catch (err) {
      console.error("Error loading conversations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(loadAll);

  async function loadDMs(athleteId: string): Promise<ChatItem[]> {
    const { data, error } = await supabase.rpc("list_dm_inbox", {
      p_athlete_id: athleteId,
    });

    if (error) {
      console.error("list_dm_inbox:", error.message);
      return [];
    }

    const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    return rows.map((row) => {
      const r = row as {
        conversation_id: string;
        friend_id: string;
        friend_username: string | null;
        friend_avatar_url: string | null;
        last_message: string | null;
        last_message_at: string | null;
      };
      const lastMessageAt = r.last_message_at || new Date(0).toISOString();
      return {
        id: `dm-${r.conversation_id}`,
        type: "dm" as const,
        name: r.friend_username || "Unknown",
        avatar: r.friend_avatar_url || null,
        lastMessage: r.last_message || "No messages yet",
        lastMessageAt,
        unread: isUnread(`dm-${r.conversation_id}`, lastMessageAt),
        link: `/app/chat/${r.friend_id}`,
        conversationId: r.conversation_id,
        friendId: r.friend_id,
      };
    });
  }

  async function loadGroupChats(athleteId: string): Promise<ChatItem[]> {
    const { data: memberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("athlete_id", athleteId);

    if (!memberships?.length) return [];

    const convoIds = memberships.map((m) => m.conversation_id as string);

    const { data: convos } = await supabase
      .from("conversations")
      .select("id, name")
      .in("id", convoIds)
      .eq("is_group", true);

    if (!convos?.length) return [];

    const results: ChatItem[] = [];
    for (const convo of convos) {
      const { data: lastMsgs } = await supabase
        .from("conversation_messages")
        .select("content, created_at")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMsg = lastMsgs?.[0];

      const { data: league } = await supabase
        .from("private_leagues")
        .select("image_url")
        .eq("conversation_id", convo.id)
        .maybeSingle();

      const lastMessageAt = lastMsg?.created_at || new Date(0).toISOString();
      results.push({
        id: `group-${convo.id}`,
        type: "group",
        name: convo.name || "Group Chat",
        avatar: league?.image_url || null,
        lastMessage: lastMsg?.content || "No messages yet",
        lastMessageAt,
        unread: isUnread(`group-${convo.id}`, lastMessageAt),
        link: `/app/chat/group/${convo.id}`,
      });
    }

    return results;
  }

  // Realtime: bump unread dot when a new message arrives in any conversation we know about.
  useEffect(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
    }

    const ch = supabase
      .channel("chat-inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversation_messages" },
        (payload) => {
          const newMsg = payload.new as {
            conversation_id: string;
            created_at: string;
            athlete_id: string;
            content?: string | null;
          };
          setItems((prev) => {
            const updated = prev.map((item) => {
              const convId = newMsg.conversation_id;
              const matches = item.id === `group-${convId}` || item.id === `dm-${convId}`;
              if (!matches) return item;
              const isMine = athleteId != null && newMsg.athlete_id === athleteId;
              if (isMine) return item;
              return {
                ...item,
                lastMessage: newMsg.content || item.lastMessage,
                lastMessageAt: newMsg.created_at,
                unread: true,
              };
            });
            return updated.sort(
              (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
            );
          });
        },
      )
      .subscribe();

    channelRef.current = ch;
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const existingDmFriendIds = items
    .filter((i) => i.type === "dm")
    .map((i) => i.friendId ?? "")
    .filter(Boolean);

  return (
    <AppShell>
      <ChatPremiumGate>
      <div className="space-y-2" {...pullHandlers}>
        {(isRefreshing || pullDistance > 0) && (
          <p className="text-center text-xs text-muted-foreground">
            {isRefreshing ? "Refreshing chats..." : pullDistance > 72 ? "Release to refresh" : "Pull to refresh"}
          </p>
        )}
        <div className="flex items-center justify-end mb-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNewMsgOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <PenSquare className="h-5 w-5" />
          </Button>
        </div>

        {loading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
        ) : items.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground">
              Tap <PenSquare className="inline h-4 w-4" /> to start a new conversation
            </p>
          </div>
        ) : (
          <>
            {items.map((item) => (
              <Link
                key={item.id}
                to={item.link}
                className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-muted-foreground/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                  {item.avatar ? (
                    <img src={item.avatar} alt="" className="w-full h-full object-cover" />
                  ) : item.type === "group" ? (
                    <Users className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <span className="text-lg font-medium text-muted-foreground">
                      {item.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground truncate">{item.name}</span>
                    {item.lastMessageAt !== new Date(0).toISOString() && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{item.lastMessage}</p>
                </div>
                {item.unread && (
                  <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
                )}
              </Link>
            ))}
          </>
        )}
      </div>

      {athleteId && (
        <NewMessageModal
          open={newMsgOpen}
          onClose={() => setNewMsgOpen(false)}
          myAthleteId={athleteId}
          existingDmFriendIds={existingDmFriendIds}
          onSelect={async (friendId) => {
            setNewMsgOpen(false);
            const { conversationId, error } = await getOrCreateDmConversation(athleteId, friendId);
            if (error) {
              toast.error(error);
              return;
            }
            if (!conversationId) {
              toast.error("Could not start conversation");
              return;
            }
            navigate(`/app/chat/${friendId}`);
          }}
        />
      )}
      </ChatPremiumGate>
    </AppShell>
  );
}
