import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/** Catches render/lifecycle errors in the tree below — shows a fallback instead of a blank screen. */
export class RootErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[RootErrorBoundary]', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-12 text-center text-foreground">
          <div className="max-w-md space-y-2">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{error.message}</p>
          </div>
          <Button type="button" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
