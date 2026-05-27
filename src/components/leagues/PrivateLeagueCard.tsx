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
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-[hsla(0,0%,10%,1)] px-2.5 py-2 shadow-sm">
      <Link to={`/app/leagues/${id}`} className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/80 bg-[hsla(0,0%,14%,1)]">
          {imageUrl ? (
            <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <LeagueChevronLogo className="h-full w-full" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn('type-heading truncate')}>{name}</p>
          <p className="type-meta mt-0.5 truncate">
            {description ?? `${memberCount} member${memberCount !== 1 ? 's' : ''}`}
          </p>
        </div>
      </Link>

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => {
            if (onAddFriend) { onAddFriend(); return; }
            if (!inviteCode) return;
            onShareInvite?.();
          }}
          disabled={!onAddFriend && !inviteCode}
          title={onAddFriend ? 'Add friend to club' : inviteCode ? 'Invite friends' : 'Invite unavailable'}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
          aria-label="Add friend to club"
        >
          <UserPlus className="h-4 w-4" />
        </button>
        <Link
          to={chatHref}
          className="rounded-lg p-2 text-secondary transition-colors hover:bg-muted/60"
          aria-label="Club chat"
        >
          <MessageCircle className="h-4 w-4 fill-secondary/20" />
        </Link>
      </div>
    </div>
  );
}
