import { ReactNode } from 'react';
import RNKXLogo from '@/components/RNKXLogo';
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
      <header className="app-header border-b border-border bg-background px-4">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between">
          <h1 className="m-0">
            <RNKXLogo size="header" />
          </h1>
          <div className="flex min-w-0 shrink-0 justify-end gap-1 sm:gap-2">{headerActions ?? null}</div>
        </div>
      </header>
      <main className="app-content px-4 py-4">{children}</main>
      <BottomNav />
    </div>
  );
}
