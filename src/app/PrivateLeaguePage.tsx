import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, MessageCircle, UserPlus, Users, Pencil, Share2, LogOut, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { InviteFriendModal } from "@/components/leagues/InviteFriendModal";
import { EditLeagueModal } from "@/components/leagues/EditLeagueModal";
import { LeaguePodium } from "@/components/leagues/LeaguePodium";
import { LeagueHighlights } from "@/components/leagues/LeagueHighlights";
import { LeagueActivityFeed } from "@/components/leagues/LeagueActivityFeed";

interface LeagueMember {
  id: string;
  username: string;
  avatar_url: string | null;
  country: string | null;
  score: number;
  rank: number;
}

interface LeagueInfo {
  id: string;
  name: string;
  league_type: string;
  image_url: string | null;
  description: string | null;
  conversation_id: string | null;
  created_by: string;
  invite_code: string | null;
}

export default function PrivateLeaguePage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [myAthleteId, setMyAthleteId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const loadLeague = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let athleteId: string | null = null;
      if (user) {
        const { data: me } = await supabase.from("athletes").select("id").eq("user_id", user.id).single();
        if (me) { athleteId = me.id; setMyAthleteId(me.id); }
      }

      const { data: leagueData, error: leagueErr } = await supabase
        .from("private_leagues")
        .select("id, name, league_type, conversation_id, created_by, image_url, description")
        .eq("id", leagueId)
        .single();

      if (leagueErr || !leagueData) { navigate("/app/leaderboard"); return; }
      // invite_code is in DB but may not be in generated types yet
      const { data: codeRow } = await supabase
        .from("private_leagues")
        .select("invite_code" as any)
        .eq("id", leagueId)
        .single();

      setLeague({ ...(leagueData as any), invite_code: (codeRow as any)?.invite_code || null });
      setIsCreator(athleteId === leagueData.created_by);

      const { data: memberRows } = await supabase
        .from("private_league_members")
        .select("athlete_id, athletes(id, username, avatar_url, country)")
        .eq("league_id", leagueId);

      if (!memberRows) { setMembers([]); setLoading(false); return; }

      const ids = memberRows.map((r) => (r.athletes as any)?.id).filter(Boolean);
      setMemberIds(ids);

      const { data: season } = await supabase.from("seasons").select("id").eq("is_active", true).single();
      if (season) setSeasonId(season.id);

      let statsMap: Record<string, { score: number; rank: number }> = {};
      if (season && ids.length > 0) {
        const { data: stats } = await supabase
          .from("athlete_stats")
          .select("athlete_id, score, rank")
          .eq("season_id", season.id)
          .eq("category", leagueData.league_type)
          .in("athlete_id", ids);

        if (stats) {
          for (const s of stats) statsMap[s.athlete_id] = { score: s.score || 0, rank: s.rank || 999 };
        }
      }

      const leaderboard: LeagueMember[] = memberRows
        .filter((r) => r.athletes)
        .map((r) => {
          const a = r.athletes as any;
          const stat = statsMap[a.id] || { score: 0, rank: 999 };
          return { id: a.id, username: a.username, avatar_url: a.avatar_url, country: a.country, score: stat.score, rank: stat.rank };
        })
        .sort((a, b) => b.score - a.score);

      leaderboard.forEach((m, i) => (m.rank = i + 1));
      setMembers(leaderboard);
    } catch (err) {
      console.error("Error loading league:", err);
    } finally {
      setLoading(false);
    }
  }, [leagueId, navigate]);

  useEffect(() => { loadLeague(); }, [loadLeague]);

  const handleShare = async () => {
    const code = league?.invite_code;
    if (!code) { toast({ title: "No invite code", variant: "destructive" }); return; }
    const url = `${window.location.origin}/join/${code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Join ${league?.name}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied!" });
      }
    } catch { /* user cancelled */ }
  };

  const handleLeave = async () => {
    if (!myAthleteId || !leagueId) return;
    try {
      await supabase.from("private_league_members").delete().eq("league_id", leagueId).eq("athlete_id", myAthleteId);
      if (league?.conversation_id) {
        await supabase.from("conversation_members").delete().eq("conversation_id", league.conversation_id).eq("athlete_id", myAthleteId);
      }
      toast({ title: "You left the league" });
      navigate("/app/leaderboard");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!myAthleteId || !leagueId) return;
    try {
      const { error } = await supabase.rpc("delete_private_league", {
        p_league_id: leagueId,
        p_athlete_id: myAthleteId,
      });
      if (error) throw error;
      toast({ title: "League deleted" });
      navigate("/app/leaderboard");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const leagueType = league?.league_type as "engine" | "run" | undefined;

  return (
    <AppShell>
      <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/app/leaderboard")} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm text-muted-foreground">Back to Leaderboard</span>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : league ? (
          <>
            {/* League Hero */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {league.image_url ? (
                    <img src={league.image_url} alt={league.name} className="w-full h-full object-cover" />
                  ) : (
                    <Users className="h-7 w-7 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="font-display text-xl text-foreground truncate">{league.name}</h1>
                    {isCreator && (
                      <button onClick={() => setEditOpen(true)} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span className={cn("font-medium", leagueType === "engine" ? "text-primary" : "text-secondary")}>
                      {leagueType === "engine" ? "❤️‍🔥 Engine" : "🏃 Run"}
                    </span>
                  </div>
                </div>
              </div>
              {league.description && <p className="text-sm text-muted-foreground">{league.description}</p>}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Invite
                </Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={handleShare}>
                  <Share2 className="h-4 w-4" /> Share
                </Button>
                {league.conversation_id && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate(`/app/chat/group/${league.conversation_id}`)}>
                    <MessageCircle className="h-4 w-4" /> Chat
                  </Button>
                )}
                {isCreator ? (
                  <Button size="icon" variant="outline" className="h-9 w-9 text-destructive border-destructive/30 hover:bg-destructive/10 ml-auto" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="icon" variant="outline" className="h-9 w-9 text-muted-foreground ml-auto" onClick={() => setLeaveOpen(true)}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Podium */}
            {leagueType && <LeaguePodium members={members} leagueType={leagueType} />}

            {/* Highlights */}
            {leagueType && <LeagueHighlights memberIds={memberIds} leagueType={leagueType} seasonId={seasonId} />}

            {/* Standings */}
            <div className="space-y-2">
              <h2 className="font-display text-sm text-muted-foreground uppercase tracking-wider px-1">Standings</h2>
              {members.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No scores yet — go log a workout!</div>
              ) : (
                members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                    <div className="w-8 flex items-center justify-center">
                      {member.rank <= 3 ? (
                        <span className={cn("font-display text-lg",
                          member.rank === 1 ? "rank-gold" : member.rank === 2 ? "rank-silver" : "rank-bronze"
                        )}>{member.rank}</span>
                      ) : (
                        <span className="text-muted-foreground font-medium text-sm">{member.rank}</span>
                      )}
                    </div>
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">{member.username.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground text-sm truncate">{member.username}</div>
                      <div className="text-xs text-muted-foreground">{member.country || "Unknown"}</div>
                    </div>
                    <div className="text-right">
                      <div className={cn("font-display text-lg", leagueType === "engine" ? "text-primary" : "text-secondary")}>
                        {member.score.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">pts</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Activity Feed */}
            {leagueType && <LeagueActivityFeed memberIds={memberIds} leagueType={leagueType} seasonId={seasonId} />}
          </>
        ) : null}

        {/* Modals */}
        {leagueId && <InviteFriendModal open={inviteOpen} onOpenChange={setInviteOpen} leagueId={leagueId} leagueName={league?.name || ""} onInvited={() => {}} />}
        {league && <EditLeagueModal open={editOpen} onOpenChange={setEditOpen} league={league} onSaved={loadLeague} />}

        {/* Leave Confirmation */}
        <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave league?</AlertDialogTitle>
              <AlertDialogDescription>You'll be removed from {league?.name} and its group chat. You can rejoin later with an invite.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLeave}>Leave</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete league?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently delete {league?.name}, all member standings, and the group chat. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppShell>
  );
}
