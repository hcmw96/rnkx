import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/services/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChatPremiumGate } from "@/components/chat/ChatPremiumGate";
import { resolveAthleteId } from "@/lib/resolveAthleteId";
import { toast } from "sonner";

interface Message {
  id: string;
  athlete_id: string;
  body: string;
  created_at: string;
}

interface Member {
  id: string;
  username: string;
  avatar_url: string | null;
}

export default function GroupChatThread() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [groupName, setGroupName] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [newMsg, setNewMsg] = useState("");
  const [myAthleteId, setMyAthleteId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await supabase
      .from("conversation_messages")
      .select("id, athlete_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      toast.error(error.message);
      return;
    }
    setMessages((data as Message[]) ?? []);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const aid = await resolveAthleteId(user.id);
      if (!aid) return;

      setMyAthleteId(aid);

      const { data: conv } = await supabase
        .from("conversations")
        .select("name")
        .eq("id", conversationId)
        .single();
      if (conv) setGroupName(conv.name || "Group");

      const { data: cms } = await supabase
        .from("conversation_members")
        .select("athlete_id")
        .eq("conversation_id", conversationId);

      if (cms) {
        setMemberCount(cms.length);
        const memberIds = cms.map((cm) => cm.athlete_id as string);
        const { data: athletes } = await supabase
          .from("athletes")
          .select("id, username, avatar_url")
          .in("id", memberIds);

        const memberMap = new Map<string, Member>();
        for (const a of athletes ?? []) {
          memberMap.set(a.id as string, a as Member);
        }
        setMembers(memberMap);
      }

      await loadMessages();
    }

    void init();
  }, [conversationId, loadMessages]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`group-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
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
    if (!content || !myAthleteId || !conversationId || sending) return;
    setSending(true);
    try {
      const { data: inserted, error } = await supabase
        .from("conversation_messages")
        .insert({
          conversation_id: conversationId,
          athlete_id: myAthleteId,
          body: content,
        })
        .select("id, athlete_id, body, created_at")
        .single();

      if (error) throw error;

      setNewMsg("");
      if (inserted) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === inserted.id)) return prev;
          return [...prev, inserted as Message];
        });
      }
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
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="type-card-title leading-tight">{groupName}</h1>
            <p className="text-xs text-muted-foreground">{memberCount} members</p>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="app-content px-4 py-4 space-y-1">
        {messages.map((msg) => {
          const isMine = msg.athlete_id === myAthleteId;
          const sender = members.get(msg.athlete_id);
          return (
            <div key={msg.id} className="group">
              {!isMine && (
                <div className="flex items-center gap-1.5 ml-1 mb-0.5">
                  <div className="w-4 h-4 rounded-full bg-muted overflow-hidden">
                    {sender?.avatar_url ? (
                      <img src={sender.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-caption flex items-center justify-center h-full text-muted-foreground">
                        {sender?.username?.charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {sender?.username || "Unknown"}
                  </span>
                </div>
              )}
              <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2",
                    isMine
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border text-foreground rounded-bl-md"
                  )}
                >
                  <p className="text-sm break-words">{msg.body}</p>
                  <p className={cn(
                    "text-xs mt-1",
                    isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                  )}>
                    {format(new Date(msg.created_at), "HH:mm")}
                  </p>
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
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newMsg.trim() || sending}
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
