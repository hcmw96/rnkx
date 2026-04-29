import type { TouchEvent } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

type PullToRefreshOptions = {
  threshold?: number;
  enabled?: boolean;
};

type PullHandlers = {
  onTouchStart: (event: TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: TouchEvent<HTMLElement>) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
};

export function usePullToRefresh(
  onRefresh: () => Promise<void>,
  { threshold = 72, enabled = true }: PullToRefreshOptions = {},
): { isRefreshing: boolean; isPulling: boolean; pullDistance: number; pullHandlers: PullHandlers } {
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const resetPull = useCallback(() => {
    startYRef.current = null;
    pullingRef.current = false;
    setPullDistance(0);
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      refreshingRef.current = false;
    }
  }, [onRefresh]);

  const pullHandlers = useMemo<PullHandlers>(
    () => ({
      onTouchStart: (event) => {
        if (!enabled || refreshingRef.current) return;
        const container = event.currentTarget;
        if (container.scrollTop > 0) {
          startYRef.current = null;
          pullingRef.current = false;
          return;
        }
        startYRef.current = event.touches[0]?.clientY ?? null;
        pullingRef.current = true;
      },
      onTouchMove: (event) => {
        if (!enabled || refreshingRef.current || !pullingRef.current || startYRef.current == null) return;
        const container = event.currentTarget;
        if (container.scrollTop > 0) {
          resetPull();
          return;
        }
        const currentY = event.touches[0]?.clientY ?? startYRef.current;
        const deltaY = Math.max(0, currentY - startYRef.current);
        setPullDistance(Math.min(deltaY, threshold * 1.5));
      },
      onTouchEnd: () => {
        if (!enabled || refreshingRef.current) {
          resetPull();
          return;
        }
        const shouldRefresh = pullDistance >= threshold;
        resetPull();
        if (shouldRefresh) {
          void triggerRefresh();
        }
      },
      onTouchCancel: () => {
        resetPull();
      },
    }),
    [enabled, pullDistance, resetPull, threshold, triggerRefresh],
  );

  return {
    isRefreshing,
    isPulling: pullDistance > 0,
    pullDistance,
    pullHandlers,
  };
}
