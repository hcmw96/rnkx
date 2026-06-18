import { Link } from 'react-router-dom';
import { Bell, MessageCircle, Settings } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { usePendingFriendRequestCount } from '@/hooks/usePendingFriendRequestCount';
import { useUnreadCount } from '@/hooks/useUnreadCount';

export function AppHeaderActions() {
  const unreadMessages = useUnreadCount();
  const pendingInvites = usePendingFriendRequestCount();

  return (
    <>
      <Link
        to="/app/chat"
        aria-label={unreadMessages > 0 ? `Messages (${unreadMessages} unread)` : 'Messages'}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => haptic('light')}
      >
        <MessageCircle className="h-5 w-5" />
        {unreadMessages > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-primary-foreground">
            {unreadMessages > 9 ? '9+' : unreadMessages}
          </span>
        )}
      </Link>
      <Link
        to="/app/notifications"
        aria-label={
          pendingInvites > 0 ? `Notifications (${pendingInvites} pending)` : 'Notifications'
        }
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => haptic('light')}
      >
        <Bell className="h-5 w-5" />
        {pendingInvites > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-neon-lime text-[10px] font-bold leading-none text-black">
            {pendingInvites > 9 ? '9+' : pendingInvites}
          </span>
        )}
      </Link>
      <Link
        to="/app/settings"
        aria-label="Settings"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => haptic('light')}
      >
        <Settings className="h-5 w-5" />
      </Link>
    </>
  );
}
