import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchAcceptedFriendIds } from '@/lib/friendships';
import { supabase } from '@/services/supabase';

type FriendOption = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type NewMessageModalProps = {
  open: boolean;
  onClose: () => void;
  myAthleteId: string;
  existingDmFriendIds: string[];
  onSelect: (friendId: string) => void;
};

export function NewMessageModal({
  open,
  onClose,
  myAthleteId,
  existingDmFriendIds,
  onSelect,
}: NewMessageModalProps) {
  const [friends, setFriends] = useState<FriendOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const loadFriends = useCallback(async () => {
    setLoading(true);
    const ids = await fetchAcceptedFriendIds(myAthleteId);
    if (!ids.length) {
      setFriends([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('athletes')
      .select('id, username, display_name, avatar_url')
      .in('id', ids);
    setFriends((data ?? []) as FriendOption[]);
    setLoading(false);
  }, [myAthleteId]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    void loadFriends();
  }, [open, loadFriends]);

  const q = query.trim().toLowerCase();
  const filtered = friends.filter((f) => {
    if (!q) return true;
    const name = (f.display_name ?? '').toLowerCase();
    const user = (f.username ?? '').toLowerCase();
    return name.includes(q) || user.includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans text-lg font-semibold">New message</DialogTitle>
          <DialogDescription>Choose a friend to message.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search friends…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {loading ? (
            <li className="py-6 text-center text-sm text-muted-foreground">Loading friends…</li>
          ) : filtered.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted-foreground">
              {friends.length === 0
                ? 'Add friends from the Social tab to start chatting.'
                : 'No friends match your search.'}
            </li>
          ) : (
            filtered.map((f) => {
              const label = f.display_name?.trim() || f.username || 'Athlete';
              const hasThread = existingDmFriendIds.includes(f.id);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-muted/40"
                    onClick={() => onSelect(f.id)}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-muted-foreground">
                          {label.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{label}</p>
                      <p className="truncate text-xs text-muted-foreground">@{f.username ?? '—'}</p>
                    </div>
                    {hasThread ? (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Open
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <Button type="button" variant="outline" className="w-full border-border" onClick={onClose}>
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
