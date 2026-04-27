import { Users, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface PrivateLeagueCardProps {
  id: string;
  name: string;
  memberCount: number;
  inviteCode: string | null;
  conversationId?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  onShareInvite: () => void;
}

export function PrivateLeagueCard({
  id,
  name,
  memberCount,
  inviteCode,
  imageUrl,
  description,
  onShareInvite,
}: PrivateLeagueCardProps) {
  return (
    <Link
      to={`/app/leagues/${id}`}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3',
        'transition-colors hover:border-muted-foreground/50',
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <Users className="h-5 w-5 text-primary" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{name}</div>
        {description ? (
          <div className="truncate text-xs text-muted-foreground">{description}</div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {memberCount} member{memberCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!inviteCode) return;
            onShareInvite();
          }}
          disabled={!inviteCode}
          title={inviteCode ? 'Invite friends' : 'Invite link unavailable'}
          className="p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <UserPlus className="h-4 w-4" />
        </button>
      </div>
    </Link>
  );
}
