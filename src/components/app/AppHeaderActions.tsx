import { Link } from 'react-router-dom';
import { Bell, MessageCircle, Settings } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { usePendingFriendRequestCount } from '@/hooks/usePendingFriendRequestCount';
import { useUnreadCount } from '@/hooks/useUnreadCount';

export function AppHeaderActions() {
  const unreadMessages = useUnreadCount();
  const pendingFriends = usePendingFriendRequestCount();
  const notificationCount = pendingFriends;

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
          notificationCount > 0 ? `Notifications (${notificationCount} pending)` : 'Notifications'
        }
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => haptic('light')}
      >
        <Bell className="h-5 w-5" />
        {notificationCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-primary-foreground">
            {notificationCount > 9 ? '9+' : notificationCount}
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
