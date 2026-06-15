import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";
import { ChatPremiumGate } from "@/components/chat/ChatPremiumGate";
import { ChatPreview } from "@/components/premium/PreviewMocks";
import { NewMessageModal } from "@/components/chat/NewMessageModal";
import { supabase } from "@/services/supabase";
import { resolveAthleteId } from "@/lib/resolveAthleteId";
import { getOrCreateDmConversation } from "@/lib/chatConversation";
import { loadUnifiedChatInbox, type ChatInboxItem } from "@/lib/chatInboxLoad";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Users, PenSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { toast } from "sonner";
import { AthleteAvatarImg } from "@/components/AthleteAvatarImg";
import { UNREAD_CHANGED_EVENT } from "@/lib/unreadMessages";
import type { RealtimeChannel } from "@supabase/supabase-js";

export default function ChatPage() {
  const [items, setItems] = useState<ChatInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const navigate = useNavigate();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const loadAllRef = useRef<() => Promise<void>>(async () => {});

  const loadAll = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const aid = await resolveAthleteId(user.id);
      if (!aid) return;
      setAthleteId(aid);

      const all = await loadUnifiedChatInbox(aid);
      setItems(all);
    } catch (err) {
      console.error("Error loading conversations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  loadAllRef.current = loadAll;

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const refresh = () => void loadAll();
    window.addEventListener(UNREAD_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(UNREAD_CHANGED_EVENT, refresh);
  }, [loadAll]);

  const { isRefreshing, pullDistance, pullHandlers } = usePullToRefresh(loadAll);

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
            const convId = newMsg.conversation_id;
            const idx = prev.findIndex(
              (item) => item.id === `group-${convId}` || item.id === `dm-${convId}`,
            );
            if (idx < 0) {
              void loadAllRef.current();
              return prev;
            }
            const isMine = athleteId != null && newMsg.athlete_id === athleteId;
            const updated = prev.map((item, i) => {
              if (i !== idx) return item;
              if (isMine) {
                return {
                  ...item,
                  lastMessage: newMsg.content || item.lastMessage,
                  lastMessageAt: newMsg.created_at,
                };
              }
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
  }, [athleteId]);

  const existingDmFriendIds = items
    .filter((i) => i.type === "dm")
    .map((i) => i.friendId ?? "")
    .filter(Boolean);

  return (
    <AppShell>
      <div className="mx-auto max-w-lg space-y-4">
        <ChatPremiumGate previewContent={!loading && items.length === 0 ? <ChatPreview /> : undefined}>
      {!loading && athleteId ? (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNewMsgOpen(true)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="New message"
          >
            <PenSquare className="h-5 w-5" />
          </Button>
        </div>
      ) : null}
      <div className="space-y-2" {...pullHandlers}>
        {(isRefreshing || pullDistance > 0) && (
          <p className="text-center text-xs text-muted-foreground">
            {isRefreshing ? "Refreshing chats..." : pullDistance > 72 ? "Release to refresh" : "Pull to refresh"}
          </p>
        )}

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
                  {item.type === "dm" ? (
                    <AthleteAvatarImg avatarUrl={item.profileAvatarUrl} />
                  ) : item.avatar ? (
                    <img src={item.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Users className="h-5 w-5 text-muted-foreground" />
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
      </div>
    </AppShell>
  );
}
