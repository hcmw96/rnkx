import { Link } from 'react-router-dom';
import { Bell, MessageCircle, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { haptic } from '@/lib/haptics';

export function AppHeaderActions() {
  return (
    <>
      <Link
        to="/app/social"
        aria-label="Messages"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => haptic('light')}
      >
        <MessageCircle className="h-5 w-5" />
      </Link>
      <button
        type="button"
        aria-label="Notifications"
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => {
          haptic('light');
          toast.message('Notifications', { description: 'Alerts will appear here soon.' });
        }}
      >
        <Bell className="h-5 w-5" />
      </button>
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
