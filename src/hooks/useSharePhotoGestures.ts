import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampSharePhotoTransform,
  DEFAULT_SHARE_PHOTO_TRANSFORM,
  SHARE_PHOTO_MAX_SCALE,
  SHARE_PHOTO_MIN_SCALE,
  type SharePhotoTransform,
} from '@/lib/sharePhotoTransform';

type UseSharePhotoGesturesOptions = {
  enabled: boolean;
  imageWidth: number;
  imageHeight: number;
  /** Screen → card coordinate scale (e.g. preview CSS scale 0.28). */
  viewScale: number;
  transform: SharePhotoTransform;
  onTransformChange: (next: SharePhotoTransform) => void;
};

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Instagram-style pan / pinch / double-tap-reset on the photo layer.
 * Coordinates are converted from screen space into 1080×1920 card space via viewScale.
 */
export function useSharePhotoGestures({
  enabled,
  imageWidth,
  imageHeight,
  viewScale,
  transform,
  onTransformChange,
}: UseSharePhotoGesturesOptions) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef(transform);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTapRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const apply = useCallback(
    (next: SharePhotoTransform) => {
      const clamped = clampSharePhotoTransform(next, imageWidth, imageHeight);
      transformRef.current = clamped;
      onTransformChange(clamped);
    },
    [imageWidth, imageHeight, onTransformChange],
  );

  const reset = useCallback(() => {
    apply(DEFAULT_SHARE_PHOTO_TRANSFORM);
  }, [apply]);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el || !enabled || imageWidth <= 0 || imageHeight <= 0) return;

    const toCardDelta = (screenDx: number, screenDy: number) => ({
      dx: screenDx / viewScale,
      dy: screenDy / viewScale,
    });

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setDragging(true);

      if (pointersRef.current.size === 1) {
        const now = Date.now();
        if (now - lastTapRef.current < 280) {
          lastTapRef.current = 0;
          reset();
          panStartRef.current = null;
          return;
        }
        lastTapRef.current = now;

        const t = transformRef.current;
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          tx: t.x,
          ty: t.y,
        };
        pinchStartRef.current = null;
      } else if (pointersRef.current.size === 2) {
        const pts = [...pointersRef.current.values()];
        pinchStartRef.current = {
          distance: distance(pts[0], pts[1]),
          scale: transformRef.current.scale,
        };
        panStartRef.current = null;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 2 && pinchStartRef.current) {
        const pts = [...pointersRef.current.values()];
        const d = distance(pts[0], pts[1]);
        if (pinchStartRef.current.distance > 0) {
          const nextScale =
            pinchStartRef.current.scale * (d / pinchStartRef.current.distance);
          apply({
            ...transformRef.current,
            scale: Math.min(SHARE_PHOTO_MAX_SCALE, Math.max(SHARE_PHOTO_MIN_SCALE, nextScale)),
          });
        }
        return;
      }

      if (pointersRef.current.size === 1 && panStartRef.current) {
        const { dx, dy } = toCardDelta(
          e.clientX - panStartRef.current.x,
          e.clientY - panStartRef.current.y,
        );
        apply({
          ...transformRef.current,
          x: panStartRef.current.tx + dx,
          y: panStartRef.current.ty + dy,
        });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      if (pointersRef.current.size === 0) {
        panStartRef.current = null;
        pinchStartRef.current = null;
        setDragging(false);
      } else if (pointersRef.current.size === 1) {
        const [pt] = pointersRef.current.values();
        const t = transformRef.current;
        panStartRef.current = { x: pt.x, y: pt.y, tx: t.x, ty: t.y };
        pinchStartRef.current = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.01);
      apply({
        ...transformRef.current,
        scale: transformRef.current.scale * factor,
      });
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [enabled, imageWidth, imageHeight, viewScale, apply, reset]);

  return { surfaceRef, dragging, reset };
}
