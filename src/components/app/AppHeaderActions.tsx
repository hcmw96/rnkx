import { Link } from 'react-router-dom';
import { Bell, MessageCircle, Settings } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { useUnreadCount } from '@/hooks/useUnreadCount';

export function AppHeaderActions() {
  const unread = useUnreadCount();

  return (
    <>
      <Link
        to="/app/chat"
        aria-label={unread > 0 ? `Messages (${unread} unread)` : 'Messages'}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => haptic('light')}
      >
        <MessageCircle className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
      <Link
        to="/app/notifications"
        aria-label="Notifications"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => haptic('light')}
      >
        <Bell className="h-5 w-5" />
      </Link>
      <Link
        to="/app/profile"
        aria-label="Settings"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => haptic('light')}
      >
        <Settings className="h-5 w-5" />
      </Link>
    </>
  );
}
