import { MessageCircle, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { LeagueChevronLogo } from '@/components/leagues/LeagueChevronLogo';

interface PrivateLeagueCardProps {
  id: string;
  name: string;
  memberCount: number;
  inviteCode?: string | null;
  conversationId?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  /** Opens add-friend modal (leaderboard leagues tab). */
  onAddFriend?: () => void;
  /** Legacy: share invite link (social leagues page). */
  onShareInvite?: () => void;
}

export function PrivateLeagueCard({
  id,
  name,
  memberCount,
  imageUrl,
  description,
  conversationId,
  onAddFriend,
  onShareInvite,
  inviteCode,
}: PrivateLeagueCardProps) {
  const chatHref = conversationId ? `/app/chat/group/${conversationId}` : `/app/leagues/${id}`;

  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border border-border/80 bg-[hsla(0,0%,10%,1)] p-3.5',
        'shadow-sm',
      )}
    >
      <Link to={`/app/leagues/${id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full">
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="h-full w-full rounded-full object-cover" />
          ) : (
            <LeagueChevronLogo className="h-11 w-11" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="type-card-title truncate">{name}</div>
          {description ? (
            <div className="truncate text-xs text-muted-foreground">{description}</div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {memberCount} member{memberCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            if (onAddFriend) {
              onAddFriend();
              return;
            }
            if (!inviteCode) return;
            onShareInvite?.();
          }}
          disabled={!onAddFriend && !inviteCode}
          title={onAddFriend ? 'Add friend to club' : inviteCode ? 'Invite friends' : 'Invite unavailable'}
          className="rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
          aria-label="Add friend to club"
        >
          <UserPlus className="h-4 w-4" />
        </button>
        <Link
          to={chatHref}
          className="rounded-lg p-2.5 text-secondary transition-colors hover:bg-muted/60"
          aria-label="Club chat"
        >
          <MessageCircle className="h-4 w-4 fill-secondary/20" />
        </Link>
      </div>
    </div>
  );
}
