import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Check, CheckCheck, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { MessageReaction } from "@/components/chat/MessageReaction";
import { GifPicker } from "@/components/chat/GifPicker";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  message_type: string;
  gif_url: string | null;
}

interface ReactionData {
  message_id: string;
  emoji: string;
  athlete_id: string;
}

export default function ChatThread() {
  const { friendId } = useParams<{ friendId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Map<string, ReactionData[]>>(new Map());
  const [newMsg, setNewMsg] = useState("");
  const [myAthleteId, setMyAthleteId] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState("");
  const [friendName, setFriendName] = useState("");
  const [friendAvatar, setFriendAvatar] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!friendId) return;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: athlete } = await supabase
        .from("athletes")
        .select("id, display_name, username")
        .eq("user_id", user.id)
        .single();

      if (!athlete) return;
      setMyAthleteId(athlete.id);
      setMyDisplayName(athlete.display_name || athlete.username);

      const { data: friend } = await supabase
        .from("athletes")
        .select("username, avatar_url")
        .eq("id", friendId)
        .single();

      if (friend) {
        setFriendName(friend.username);
        setFriendAvatar(friend.avatar_url);
      }

      await loadMessages(athlete.id);
      await loadReactions(athlete.id);

      await supabase
        .from("direct_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", friendId)
        .eq("receiver_id", athlete.id)
        .is("read_at", null);
    }

    init();
  }, [friendId]);

  // Realtime: messages INSERT + UPDATE (for read ticks)
  useEffect(() => {
    if (!myAthleteId || !friendId) return;

    const channel = supabase
      .channel(`chat-${myAthleteId}-${friendId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const msg = payload.new as Message & { receiver_id: string };
          if (
            (msg.sender_id === myAthleteId && msg.receiver_id === friendId) ||
            (msg.sender_id === friendId && msg.receiver_id === myAthleteId)
          ) {
            setMessages((prev) => [...prev, msg]);
            if (msg.sender_id === friendId) {
              supabase
                .from("direct_messages")
                .update({ read_at: new Date().toISOString() })
                .eq("id", msg.id)
                .then();
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages" },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, read_at: updated.read_at } : m))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => {
          if (myAthleteId) loadReactions(myAthleteId);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myAthleteId, friendId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function loadMessages(athleteId: string) {
    const { data } = await supabase
      .from("direct_messages")
      .select("id, sender_id, content, created_at, read_at, message_type, gif_url")
      .or(
        `and(sender_id.eq.${athleteId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${athleteId})`
      )
      .order("created_at", { ascending: true })
      .limit(200);

    setMessages((data as Message[]) || []);
  }

  async function loadReactions(athleteId: string) {
    // Get all message IDs in this conversation first
    const { data: msgs } = await supabase
      .from("direct_messages")
      .select("id")
      .or(
        `and(sender_id.eq.${athleteId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${athleteId})`
      );

    if (!msgs?.length) return;
    const msgIds = msgs.map((m) => m.id);

    const { data: rxns } = await supabase
      .from("message_reactions")
      .select("message_id, emoji, athlete_id")
      .in("message_id", msgIds);

    const map = new Map<string, ReactionData[]>();
    for (const r of rxns || []) {
      const existing = map.get(r.message_id) || [];
      existing.push(r);
      map.set(r.message_id, existing);
    }
    setReactions(map);
  }

  function getReactionsForMessage(messageId: string) {
    const rxns = reactions.get(messageId) || [];
    const emojiMap = new Map<string, { count: number; myReaction: boolean }>();
    for (const r of rxns) {
      const existing = emojiMap.get(r.emoji) || { count: 0, myReaction: false };
      existing.count++;
      if (r.athlete_id === myAthleteId) existing.myReaction = true;
      emojiMap.set(r.emoji, existing);
    }
    return Array.from(emojiMap.entries()).map(([emoji, data]) => ({
      emoji,
      ...data,
    }));
  }

  async function handleSend(msgContent?: string, type: string = "text", gifUrl?: string) {
    const content = msgContent?.trim() || newMsg.trim();
    if (!content || !myAthleteId || !friendId || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: myAthleteId,
        receiver_id: friendId,
        content,
        message_type: type,
        gif_url: gifUrl || null,
      });
      if (error) throw error;
      if (type === "text") setNewMsg("");

      supabase.functions.invoke("notify-new-message", {
        body: {
          receiver_athlete_id: friendId,
          sender_name: myDisplayName || "Someone",
          preview: type === "gif" ? "Sent a GIF" : content,
        },
      }).catch((err) => console.warn("[Push] notify failed:", err));
    } catch (err) {
      console.error("Send error:", err);
    } finally {
      setSending(false);
    }
  }

  function handleGifSelect(gifUrl: string) {
    handleSend("GIF", "gif", gifUrl);
  }

  return (
    <div className="app-root">
      <div className="safe-area-top" />

      <header className="app-header border-b border-border bg-background">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/app/chat" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            {friendAvatar ? (
              <img src={friendAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-medium text-muted-foreground">
                {friendName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <h1 className="font-display text-lg text-foreground">{friendName}</h1>
        </div>
      </header>

      <div ref={scrollRef} className="app-content px-4 py-4 space-y-1">
        {messages.map((msg) => {
          const isMine = msg.sender_id === myAthleteId;
          const msgReactions = getReactionsForMessage(msg.id);
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
                  {msg.message_type === "gif" && msg.gif_url ? (
                    <img src={msg.gif_url} alt="GIF" className="rounded-lg max-w-full" loading="lazy" />
                  ) : (
                    <p className="text-sm break-words">{msg.content}</p>
                  )}
                  <div className={cn("flex items-center gap-1 mt-1", isMine ? "justify-end" : "")}>
                    <span className={cn(
                      "text-[10px]",
                      isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                    )}>
                      {format(new Date(msg.created_at), "HH:mm")}
                    </span>
                    {isMine && (
                      msg.read_at ? (
                        <CheckCheck className={cn("h-3 w-3", "text-primary-foreground/60")} />
                      ) : (
                        <Check className={cn("h-3 w-3", "text-primary-foreground/40")} />
                      )
                    )}
                  </div>
                </div>
              </div>
              {myAthleteId && (
                <MessageReaction
                  messageId={msg.id}
                  athleteId={myAthleteId}
                  reactions={msgReactions}
                  isMine={isMine}
                  onToggle={() => myAthleteId && loadReactions(myAthleteId)}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="app-footer border-t border-border bg-background px-4 py-3">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-2 items-center"
        >
          <button
            type="button"
            onClick={() => setGifOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Image className="h-5 w-5" />
          </button>
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

      <GifPicker open={gifOpen} onClose={() => setGifOpen(false)} onSelect={handleGifSelect} />
      <div className="safe-area-bottom" />
    </div>
  );
}
