import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';

export default function NotificationsPage() {
  return (
    <AppShell>
      <section className="mx-auto max-w-lg space-y-6 py-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
          <Bell className="h-8 w-8 text-neon-lime" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-xl text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;re all caught up. Push alerts for scores, friend requests, and league activity are sent to your
            device when enabled in the RNKX app.
          </p>
        </div>
        <Button type="button" variant="outline" className="border-border" asChild>
          <Link to="/app/profile">Notification settings are in Profile</Link>
        </Button>
      </section>
    </AppShell>
  );
}
