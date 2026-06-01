import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { LeagueChevronLogo } from "@/components/leagues/LeagueChevronLogo";
import { clubImageDisplayUrl } from "@/lib/clubImageUpload";
import { fetchClubByConversationId, type ClubSummary } from "@/lib/clubContext";
import { supabase } from "@/services/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChatPremiumGate } from "@/components/chat/ChatPremiumGate";
import { resolveAthleteId } from "@/lib/resolveAthleteId";
import {
  chatMessageText,
  conversationMemberLabel,
  listConversationMembers,
  listConversationMessages,
  sendConversationMessage,
  type ChatMessageRow,
  type ConversationMemberRow,
} from "@/lib/chatMessages";
import { toast } from "sonner";
import { conversationUnreadKey, markConversationRead } from "@/lib/unreadMessages";

interface Member extends ConversationMemberRow {
  id: string;
}

function toMember(row: ConversationMemberRow): Member {
  return { ...row, id: row.athlete_id };
}

export default function GroupChatThread() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const [groupName, setGroupName] = useState("");
  const [club, setClub] = useState<ClubSummary | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [newMsg, setNewMsg] = useState("");
  const [myAthleteId, setMyAthleteId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    const { messages: rows, error } = await listConversationMessages(conversationId, 200);
    if (error) {
      toast.error(error);
      return;
    }
    setMessages(rows);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const aid = await resolveAthleteId(user.id);
      if (!aid) return;

      setMyAthleteId(aid);

      const { club: clubRow } = await fetchClubByConversationId(conversationId);
      if (clubRow) {
        setClub(clubRow);
        setGroupName(clubRow.name);
      } else {
        setClub(null);
        const { data: conv } = await supabase
          .from("conversations")
          .select("name")
          .eq("id", conversationId)
          .single();
        setGroupName(conv?.name?.trim() || "Group chat");
      }

      const { members: memberRows, error: membersErr } = await listConversationMembers(conversationId);
      if (membersErr) {
        console.warn("[group-chat] list_conversation_members:", membersErr);
      } else {
        setMemberCount(memberRows.length);
        const memberMap = new Map<string, Member>();
        for (const row of memberRows) {
          memberMap.set(row.athlete_id, toMember(row));
        }
        setMembers(memberMap);
      }

      await loadMessages();
      markConversationRead(conversationUnreadKey(conversationId));
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
    if (!content || !myAthleteId || !conversationId || sending) return;
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

  const clubImageUrl = club ? clubImageDisplayUrl(club.image_url, club.id) : null;
  const headerTitle = (
    <div>
      <h1 className="type-card-title leading-tight">{groupName}</h1>
      <p className="text-xs text-muted-foreground">{memberCount} members</p>
    </div>
  );

  return (
    <ChatPremiumGate>
    <div className="app-root">
      <header className="app-header border-b border-border bg-background">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/app/chat" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/80 bg-muted">
            {clubImageUrl ? (
              <img src={clubImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <LeagueChevronLogo className="h-full w-full" />
            )}
          </div>
          {club ? (
            <Link to={`/app/leagues/${club.id}`} className="min-w-0 flex-1">
              {headerTitle}
            </Link>
          ) : (
            <div className="min-w-0 flex-1">{headerTitle}</div>
          )}
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
                        {conversationMemberLabel(sender).charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {conversationMemberLabel(sender)}
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
                  <p className="text-sm break-words">{msg.content}</p>
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
