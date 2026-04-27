import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, Image, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { MessageReaction } from "@/components/chat/MessageReaction";
import { GifPicker } from "@/components/chat/GifPicker";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  message_type: string;
  gif_url: string | null;
}

interface Member {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface ReactionData {
  message_id: string;
  emoji: string;
  athlete_id: string;
}

export default function GroupChatThread() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Map<string, ReactionData[]>>(new Map());
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [groupName, setGroupName] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [newMsg, setNewMsg] = useState("");
  const [myAthleteId, setMyAthleteId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;
    init();
  }, [conversationId]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: athlete } = await supabase
      .from("athletes")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!athlete) return;

    setMyAthleteId(athlete.id);

    // Load conversation info
    const { data: conv } = await supabase
      .from("conversations")
      .select("name")
      .eq("id", conversationId)
      .single();
    if (conv) setGroupName(conv.name || "Group");

    // Load members
    const { data: cms } = await supabase
      .from("conversation_members")
      .select("athlete_id")
      .eq("conversation_id", conversationId);

    if (cms) {
      setMemberCount(cms.length);
      const memberIds = cms.map((cm) => cm.athlete_id);
      const { data: athletes } = await supabase
        .from("athletes")
        .select("id, username, avatar_url")
        .in("id", memberIds);

      const memberMap = new Map<string, Member>();
      for (const a of athletes || []) memberMap.set(a.id, a);
      setMembers(memberMap);
    }

    await loadMessages();
    await loadReactions();
  }

  useEffect(() => {
    if (!myAthleteId || !conversationId) return;

    const channel = supabase
      .channel(`group-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const msg = payload.new as Message & { conversation_id: string };
          if (msg.conversation_id === conversationId) {
            setMessages((prev) => [...prev, msg]);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => loadReactions()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myAthleteId, conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    const { data } = await supabase
      .from("direct_messages")
      .select("id, sender_id, content, created_at, message_type, gif_url")
      .eq("conversation_id", conversationId!)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages((data as Message[]) || []);
  }

  async function loadReactions() {
    const { data: msgs } = await supabase
      .from("direct_messages")
      .select("id")
      .eq("conversation_id", conversationId!);
    if (!msgs?.length) return;

    const { data: rxns } = await supabase
      .from("message_reactions")
      .select("message_id, emoji, athlete_id")
      .in("message_id", msgs.map((m) => m.id));

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
    return Array.from(emojiMap.entries()).map(([emoji, data]) => ({ emoji, ...data }));
  }

  async function handleSend(msgContent?: string, type: string = "text", gifUrl?: string) {
    const content = msgContent?.trim() || newMsg.trim();
    if (!content || !myAthleteId || !conversationId || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: myAthleteId,
        receiver_id: myAthleteId,
        conversation_id: conversationId,
        content,
        message_type: type,
        gif_url: gifUrl || null,
      });
      if (error) throw error;
      if (type === "text") setNewMsg("");
    } catch (err) {
      console.error("Send error:", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app-root">
      <div className="safe-area-top" />

      <header className="app-header border-b border-border bg-background">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/app/chat" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-display text-lg text-foreground leading-tight">{groupName}</h1>
            <p className="text-[10px] text-muted-foreground">{memberCount} members</p>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="app-content px-4 py-4 space-y-1">
        {messages.map((msg) => {
          const isMine = msg.sender_id === myAthleteId;
          const sender = members.get(msg.sender_id);
          const msgReactions = getReactionsForMessage(msg.id);
          return (
            <div key={msg.id} className="group">
              {!isMine && (
                <div className="flex items-center gap-1.5 ml-1 mb-0.5">
                  <div className="w-4 h-4 rounded-full bg-muted overflow-hidden">
                    {sender?.avatar_url ? (
                      <img src={sender.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[8px] flex items-center justify-center h-full text-muted-foreground">
                        {sender?.username?.charAt(0).toUpperCase() || "?"}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium">
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
                  {msg.message_type === "gif" && msg.gif_url ? (
                    <img src={msg.gif_url} alt="GIF" className="rounded-lg max-w-full" loading="lazy" />
                  ) : (
                    <p className="text-sm break-words">{msg.content}</p>
                  )}
                  <p className={cn(
                    "text-[10px] mt-1",
                    isMine ? "text-primary-foreground/60" : "text-muted-foreground"
                  )}>
                    {format(new Date(msg.created_at), "HH:mm")}
                  </p>
                </div>
              </div>
              {myAthleteId && (
                <MessageReaction
                  messageId={msg.id}
                  athleteId={myAthleteId}
                  reactions={msgReactions}
                  isMine={isMine}
                  onToggle={loadReactions}
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

      <GifPicker open={gifOpen} onClose={() => setGifOpen(false)} onSelect={(url) => handleSend("GIF", "gif", url)} />
      <div className="safe-area-bottom" />
    </div>
  );
}
