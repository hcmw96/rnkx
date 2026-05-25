import { ReactNode } from 'react';
import { AppHeaderActions } from './AppHeaderActions';
import { BottomNav } from './BottomNav';

interface AppShellProps {
  children: ReactNode;
  title?: string;
  /** @deprecated No longer used — kept so older call sites compile. */
  showSettings?: boolean;
  /** Pass `null` to hide header actions on a page. */
  headerActions?: ReactNode | null;
}

export function AppShell({ children, headerActions = <AppHeaderActions /> }: AppShellProps) {
  return (
    <div className="app-root">
      <header className="app-header border-b border-border bg-background">
        <div className="relative grid h-14 grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-4">
          <div className="min-w-0" aria-hidden />
          <h1 className="justify-self-center font-display text-xl tracking-wide text-neon-lime">
            RNKX
          </h1>
          <div className="flex min-w-0 justify-end gap-1 sm:gap-2">{headerActions ?? null}</div>
        </div>
      </header>
      <main className="app-content px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}
