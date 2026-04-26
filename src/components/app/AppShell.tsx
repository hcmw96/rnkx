import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

interface AppShellProps {
  children: ReactNode;
  title?: string;
  showSettings?: boolean;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-root">
      <div className="safe-area-top" />
      <header className="app-header border-b border-border bg-background">
        <div className="relative flex h-14 items-center justify-center px-4">
          <h1 className="font-display text-xl text-neon-lime">RNKX</h1>
        </div>
      </header>
      <main className="app-content px-4 py-4">
        {children}
      </main>
      <BottomNav />
      <div className="safe-area-bottom" />
    </div>
  );
}
