import { AppShell } from './AppShell';
import { TabKeepAlive } from './TabKeepAlive';

/** Persistent shell — header, badges, and bottom nav stay mounted between tab switches. */
export function AppLayout() {
  return (
    <AppShell>
      <TabKeepAlive />
    </AppShell>
  );
}
