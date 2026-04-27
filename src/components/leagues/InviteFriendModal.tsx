import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { Search, Loader2, UserPlus } from 'lucide-react';

interface InviteFriendModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leagueId: string;
  leagueName: string;
  onInvited: () => void;
}

interface SearchResult {
  id: string;
  display_name: string | null;
  username: string;
  avatar_url: string | null;
}

export function InviteFriendModal({ open, onOpenChange, leagueId, leagueName, onInvited }: InviteFriendModalProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const q = search.trim();
          const pattern = `%${q}%`;
          const [byUser, byName] = await Promise.all([
            supabase.from('athletes').select('id, display_name, username, avatar_url').ilike('username', pattern).limit(10),
            supabase.from('athletes').select('id, display_name, username, avatar_url').ilike('display_name', pattern).limit(10),
          ]);
          const err = byUser.error || byName.error;
          if (err) throw err;
          const map = new Map<string, SearchResult>();
          for (const row of [...(byUser.data ?? []), ...(byName.data ?? [])] as SearchResult[]) {
            map.set(row.id, row);
          }
          setResults([...map.values()].slice(0, 10));
        } catch (err) {
          console.error('Search error:', err);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  const handleAdd = async (athlete: SearchResult) => {
    setAdding(athlete.id);
    try {
      const { error } = await supabase.from('private_league_members').insert({
        league_id: leagueId,
        athlete_id: athlete.id,
        status: 'accepted',
      });

      if (error) {
        if (error.code === '23505') {
          toast.error(`${athlete.display_name || athlete.username} is already in this league.`);
        } else {
          throw error;
        }
        return;
      }

      const { data: league } = await supabase
        .from('private_leagues')
        .select('conversation_id')
        .eq('id', leagueId)
        .maybeSingle();

      if (league?.conversation_id) {
        await supabase.from('conversation_members').insert({
          conversation_id: league.conversation_id,
          athlete_id: athlete.id,
        });
      }

      if (athlete.id) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let inviterName = 'Someone';
        if (user) {
          const { data: inviterProfile } = await supabase
            .from('athletes')
            .select('display_name, username')
            .eq('user_id', user.id)
            .maybeSingle();
          if (inviterProfile) {
            inviterName = inviterProfile.display_name || inviterProfile.username || inviterName;
          }
        }

        const { data: invitedAthlete } = await supabase
          .from('athletes')
          .select('user_id')
          .eq('id', athlete.id)
          .maybeSingle();

        if (invitedAthlete?.user_id) {
          void supabase.functions
            .invoke('notify-league-invite', {
              body: {
                invited_user_id: invitedAthlete.user_id,
                league_name: leagueName,
                league_id: leagueId,
                inviter_name: inviterName,
              },
            })
            .catch((err) => console.error('[Push] League invite notification failed:', err));
        }
      }

      toast.success(`${athlete.display_name || athlete.username} has been added.`);
      onInvited();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(msg);
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">Add Friend to League</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or username…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {searching && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!searching && results.length > 0 && (
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {results.map((athlete) => (
                <button
                  key={athlete.id}
                  type="button"
                  onClick={() => void handleAdd(athlete)}
                  disabled={adding === athlete.id}
                  className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                >
                  <Avatar className="h-9 w-9">
                    {athlete.avatar_url ? <AvatarImage src={athlete.avatar_url} /> : null}
                    <AvatarFallback className="bg-muted text-xs">
                      {(athlete.display_name || athlete.username).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {athlete.display_name || athlete.username}
                    </p>
                    <p className="text-xs text-muted-foreground">@{athlete.username}</p>
                  </div>
                  {adding === athlete.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          )}

          {!searching && search.trim().length >= 2 && results.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No athletes found</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
