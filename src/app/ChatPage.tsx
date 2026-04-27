import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Users, PenSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { NewMessageModal } from "@/components/chat/NewMessageModal";

interface ChatItem {
  id: string;
  type: "dm" | "group";
  name: string;
  avatar: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: boolean;
  link: string;
}

export default function ChatPage() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: athlete } = await supabase
        .from("athletes")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!athlete) return;
      setAthleteId(athlete.id);

      const [dmItems, groupItems] = await Promise.all([
        loadDMs(athlete.id),
        loadGroupChats(athlete.id),
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
  }

  async function loadDMs(athleteId: string): Promise<ChatItem[]> {
    const { data: messages } = await supabase
      .from("direct_messages")
      .select("id, sender_id, receiver_id, content, created_at, read_at, message_type")
      .is("conversation_id", null)
      .or(`sender_id.eq.${athleteId},receiver_id.eq.${athleteId}`)
      .order("created_at", { ascending: false });

    if (!messages?.length) return [];

    const convMap = new Map<string, { lastMsg: typeof messages[0]; unread: boolean }>();
    for (const msg of messages) {
      const friendId = msg.sender_id === athleteId ? msg.receiver_id : msg.sender_id;
      if (!convMap.has(friendId)) {
        convMap.set(friendId, {
          lastMsg: msg,
          unread: msg.receiver_id === athleteId && !msg.read_at,
        });
      }
    }

    const friendIds = Array.from(convMap.keys());
    const { data: friends } = await supabase
      .from("athletes")
      .select("id, username, avatar_url")
      .in("id", friendIds);

    const friendMap = new Map((friends || []).map(f => [f.id, f]));

    return Array.from(convMap.entries()).map(([fid, { lastMsg, unread }]) => {
      const friend = friendMap.get(fid);
      return {
        id: `dm-${fid}`,
        type: "dm" as const,
        name: friend?.username || "Unknown",
        avatar: friend?.avatar_url || null,
        lastMessage: lastMsg.message_type === "gif" ? "🖼 GIF" : lastMsg.content,
        lastMessageAt: lastMsg.created_at,
        unread,
        link: `/app/chat/${fid}`,
      };
    });
  }

  async function loadGroupChats(athleteId: string): Promise<ChatItem[]> {
    // Get conversations the athlete is a member of
    const { data: memberships } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("athlete_id", athleteId);

    if (!memberships?.length) return [];

    const convoIds = memberships.map(m => m.conversation_id);

    // Get group conversations only
    const { data: convos } = await supabase
      .from("conversations")
      .select("id, name")
      .in("id", convoIds)
      .eq("is_group", true);

    if (!convos?.length) return [];

    // Get the latest message for each group conversation
    const results: ChatItem[] = [];
    for (const convo of convos) {
      const { data: lastMsgs } = await supabase
        .from("direct_messages")
        .select("content, created_at, message_type, sender_id")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMsg = lastMsgs?.[0];

      // Try to get league image for the conversation
      const { data: league } = await supabase
        .from("private_leagues")
        .select("image_url")
        .eq("conversation_id", convo.id)
        .maybeSingle();

      results.push({
        id: `group-${convo.id}`,
        type: "group",
        name: convo.name || "Group Chat",
        avatar: league?.image_url || null,
        lastMessage: lastMsg
          ? lastMsg.message_type === "gif" ? "🖼 GIF" : lastMsg.content
          : "No messages yet",
        lastMessageAt: lastMsg?.created_at || new Date(0).toISOString(),
        unread: false,
        link: `/app/chat/group/${convo.id}`,
      });
    }

    return results;
  }

  // Collect existing DM friend IDs to exclude from new message modal
  const existingDmFriendIds = items
    .filter(i => i.type === "dm")
    .map(i => i.id.replace("dm-", ""));

  return (
    <AppShell showSettings>
      <div className="space-y-2">
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
          onSelect={(friendId) => {
            setNewMsgOpen(false);
            navigate(`/app/chat/${friendId}`);
          }}
        />
      )}
    </AppShell>
  );
}
