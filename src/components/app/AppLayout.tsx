import { Outlet } from 'react-router-dom';
import { AppShell } from './AppShell';

/** Persistent shell — header, badges, and bottom nav stay mounted between tab switches. */
export function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
