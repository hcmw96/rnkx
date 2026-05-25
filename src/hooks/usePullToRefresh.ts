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

/** Scroll lives on `.app-content` (AppShell main), not on the section that spreads pullHandlers. */
function scrollContainerFor(el: HTMLElement): HTMLElement {
  const main = el.closest('.app-content');
  if (main instanceof HTMLElement) return main;
  return el;
}

export function usePullToRefresh(
  onRefresh: () => Promise<void>,
  { threshold = 72, enabled = true }: PullToRefreshOptions = {},
): { isRefreshing: boolean; isPulling: boolean; pullDistance: number; pullHandlers: PullHandlers } {
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const resetPull = useCallback(() => {
    startYRef.current = null;
    pullingRef.current = false;
    pullDistanceRef.current = 0;
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
        const scrollEl = scrollContainerFor(event.currentTarget);
        if (scrollEl.scrollTop > 0) {
          startYRef.current = null;
          pullingRef.current = false;
          return;
        }
        startYRef.current = event.touches[0]?.clientY ?? null;
        pullingRef.current = true;
      },
      onTouchMove: (event) => {
        if (!enabled || refreshingRef.current || !pullingRef.current || startYRef.current == null) return;
        const scrollEl = scrollContainerFor(event.currentTarget);
        if (scrollEl.scrollTop > 0) {
          resetPull();
          return;
        }
        const currentY = event.touches[0]?.clientY ?? startYRef.current;
        const deltaY = Math.max(0, currentY - startYRef.current);
        const next = Math.min(deltaY, threshold * 1.5);
        pullDistanceRef.current = next;
        setPullDistance(next);
      },
      onTouchEnd: () => {
        if (!enabled || refreshingRef.current) {
          resetPull();
          return;
        }
        const shouldRefresh = pullDistanceRef.current >= threshold;
        resetPull();
        if (shouldRefresh) {
          void triggerRefresh();
        }
      },
      onTouchCancel: () => {
        resetPull();
      },
    }),
    [enabled, resetPull, threshold, triggerRefresh],
  );

  return {
    isRefreshing,
    isPulling: pullDistance > 0,
    pullDistance,
    pullHandlers,
  };
}
