import { MessageCircle, Share2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { LeagueChevronLogo } from '@/components/leagues/LeagueChevronLogo';
import { clubImageDisplayUrl } from '@/lib/clubImageUpload';
import { ClubGenderChip } from '@/components/leagues/ClubGenderChip';

export type ClubLeagueType = 'engine' | 'run';

export function leagueCardBorderClass(leagueType?: ClubLeagueType | string | null): string {
  if (leagueType === 'run') {
    return 'border-electric-cyan/50 ring-1 ring-electric-cyan/20';
  }
  if (leagueType === 'engine') {
    return 'border-neon-lime/50 ring-1 ring-neon-lime/20';
  }
  return 'border-border/70';
}

interface PrivateLeagueCardProps {
  id: string;
  name: string;
  memberCount: number;
  leagueType?: ClubLeagueType;
  gender?: string | null;
  inviteCode?: string | null;
  conversationId?: string | null;
  imageUrl?: string | null;
  description?: string | null;
  myRank?: number | null;
  /** Opens add-friend modal (leaderboard leagues tab). */
  onAddFriend?: (() => void) | null;
  onShareInvite?: () => void;
  canAddFriend?: boolean;
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
  leagueType = 'engine',
  gender = 'mixed',
  myRank = null,
  canAddFriend = false,
}: PrivateLeagueCardProps) {
  const chatHref = conversationId ? `/app/chat/group/${conversationId}` : `/app/leagues/${id}`;
  const isRun = leagueType === 'run';
  const displayImageUrl = clubImageDisplayUrl(imageUrl, { cacheKey: id, leagueType });

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-[hsla(0,0%,10%,1)] px-2.5 py-2 shadow-sm',
        leagueCardBorderClass(leagueType),
      )}
    >
      <Link to={`/app/leagues/${id}`} className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/80 bg-[hsla(0,0%,14%,1)]">
          {displayImageUrl ? (
            <img src={displayImageUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <LeagueChevronLogo className="h-full w-full" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="type-heading truncate">{name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
            <ClubGenderChip gender={gender} />
            {myRank != null ? (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                #{myRank}
              </span>
            ) : null}
          </div>
          <p className="type-meta mt-0.5 truncate">
            {description ?? `${memberCount} member${memberCount !== 1 ? 's' : ''}`}
          </p>
        </div>
      </Link>

      <div className="flex shrink-0 items-center">
        {canAddFriend && onAddFriend ? (
          <button
            type="button"
            onClick={() => onAddFriend()}
            title="Add member to club"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Add member to club"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        ) : null}
        {inviteCode ? (
          <button
            type="button"
            onClick={() => onShareInvite?.()}
            title="Share invite link"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
            aria-label="Share invite link"
            disabled={!onShareInvite}
          >
            <Share2 className="h-4 w-4" />
          </button>
        ) : null}
        <Link
          to={chatHref}
          className={cn(
            'rounded-lg p-2 transition-colors hover:bg-muted/60',
            isRun ? 'text-secondary' : 'text-primary',
          )}
          aria-label="Club chat"
        >
          <MessageCircle className={cn('h-4 w-4', isRun ? 'fill-secondary/20' : 'fill-primary/20')} />
        </Link>
      </div>
    </div>
  );
}
