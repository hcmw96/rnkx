import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/services/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChatPremiumGate } from "@/components/chat/ChatPremiumGate";
import { resolveAthleteId } from "@/lib/resolveAthleteId";
import { getOrCreateDmConversation } from "@/lib/chatConversation";
import {
  chatMessageText,
  listConversationMessages,
  sendConversationMessage,
  type ChatMessageRow,
} from "@/lib/chatMessages";
import { toast } from "sonner";
import { conversationUnreadKey, markConversationRead } from "@/lib/unreadMessages";

export default function ChatThread() {
  const { friendId } = useParams<{ friendId: string }>();
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [myAthleteId, setMyAthleteId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("");
  const [friendAvatar, setFriendAvatar] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [threadReady, setThreadReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (cid: string) => {
    const { messages: rows, error } = await listConversationMessages(cid, 200);
    if (error) {
      toast.error(error);
      return;
    }
    setMessages(rows);
  }, []);

  useEffect(() => {
    if (!friendId) return;

    async function init() {
      setThreadReady(false);
      setConversationId(null);
      setMessages([]);
      setMyAthleteId(null);
      setInitError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setInitError("Sign in to send messages.");
        return;
      }

      const aid = await resolveAthleteId(user.id);
      if (!aid) {
        setInitError("Complete your profile to use chat.");
        return;
      }

      setMyAthleteId(aid);

      const { data: friend } = await supabase
        .from("athletes")
        .select("username, avatar_url")
        .eq("id", friendId)
        .single();

      if (friend) {
        setFriendName(friend.username ?? "Friend");
        setFriendAvatar(friend.avatar_url);
      }

      const { conversationId: cid, error: dmErr } = await getOrCreateDmConversation(aid, friendId);
      if (dmErr || !cid) {
        setInitError(dmErr ?? "Could not open conversation.");
        return;
      }

      setConversationId(cid);
      await loadMessages(cid);
      markConversationRead(conversationUnreadKey(cid));
      setThreadReady(true);
    }

    void init();
  }, [friendId, loadMessages]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`dm-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const raw = payload.new as ChatMessageRow & { body?: string };
          const msg: ChatMessageRow = {
            id: raw.id,
            athlete_id: raw.athlete_id,
            content: chatMessageText(raw),
            created_at: raw.created_at,
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Thread is open, so any new message has been "seen".
          markConversationRead(conversationUnreadKey(conversationId));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const content = newMsg.trim();
    if (!content || !myAthleteId || !conversationId || !threadReady || sending) return;
    setSending(true);
    try {
      const { message: inserted, error } = await sendConversationMessage(
        conversationId,
        myAthleteId,
        content,
      );

      if (error) throw new Error(error);

      setNewMsg("");
      if (inserted) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === inserted.id)) return prev;
          return [...prev, inserted];
        });
      }

      markConversationRead(conversationUnreadKey(conversationId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send message";
      toast.error(message);
      console.error("Send error:", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <ChatPremiumGate>
    <div className="app-root">
      <header className="app-header border-b border-border bg-background">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/app/chat" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            {friendAvatar ? (
              <img src={friendAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="type-meta">
                {friendName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {friendId ? (
            <Link
              to={`/app/friends/${friendId}`}
              className="type-card-title min-w-0 truncate hover:text-neon-lime"
            >
              {friendName}
            </Link>
          ) : (
            <h1 className="type-card-title">{friendName}</h1>
          )}
        </div>
      </header>

      {initError ? (
        <p className="px-4 py-6 text-center text-sm text-destructive">{initError}</p>
      ) : null}

      <div ref={scrollRef} className="app-content px-4 py-4 space-y-1">
        {messages.map((msg) => {
          const isMine = msg.athlete_id === myAthleteId;
          return (
            <div key={msg.id} className="group">
              <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2",
                    isMine
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border text-foreground rounded-bl-md"
                  )}
                >
                  <p className="text-sm break-words">{msg.content}</p>
                  <div className={cn("flex items-center gap-1 mt-1", isMine ? "justify-end" : "")}>
                    <span className={cn(
                      "text-xs",
                      isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                    )}>
                      {format(new Date(msg.created_at), "HH:mm")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="app-footer border-t border-border bg-background px-4 py-3">
        <form
          onSubmit={(e) => { e.preventDefault(); void handleSend(); }}
          className="flex gap-2 items-center"
        >
          <Input
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder="Message…"
            className="flex-1"
            maxLength={500}
            disabled={!threadReady || !conversationId || !!initError}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newMsg.trim() || sending || !threadReady || !conversationId || !!initError}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

    </div>
    </ChatPremiumGate>
  );
}
