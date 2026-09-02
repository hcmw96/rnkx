import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, useShareCardImagesReady } from '@/lib/shareCardImage';
import { ENGINE_CHART_COLOR } from '@/lib/chartTheme';
import {
  clampSharePhotoTransform,
  coverFitScale,
  DEFAULT_SHARE_PHOTO_TRANSFORM,
  type SharePhotoTransform,
} from '@/lib/sharePhotoTransform';
import rnkxLogo from '@/assets/rnkx-logo.svg';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';

type ShareCardFrameProps = {
  backgroundImageUrl?: string | null;
  photoTransform?: SharePhotoTransform;
  /** League accent for the RNKX gradient (defaults to Engine lime). */
  accentColor?: string;
  /** Top wordmark — hide when the card places the mark in the stats row. */
  showLogo?: boolean;
  children: ReactNode;
  className?: string;
};

const CANVAS_BOX: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: SHARE_CARD_WIDTH,
  height: SHARE_CARD_HEIGHT,
};

function RnkxGradientBackground({ accentColor }: { accentColor: string }) {
  return (
    <>
      <div
        style={{
          ...CANVAS_BOX,
          background: '#000000',
        }}
      />
      <div
        style={{
          ...CANVAS_BOX,
          background: `radial-gradient(ellipse 95% 55% at 50% 108%, ${accentColor} 0%, transparent 62%)`,
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          ...CANVAS_BOX,
          background: `linear-gradient(0deg, ${accentColor} 0%, transparent 38%)`,
          opacity: 0.18,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

function PhotoBackground({
  url,
  transform,
}: {
  url: string;
  transform: SharePhotoTransform;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    setNatural(null);
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setNatural(null);
    img.src = url;
  }, [url]);

  const w = natural?.w ?? 0;
  const h = natural?.h ?? 0;
  const hasSize = w > 0 && h > 0;
  const clamped = hasSize
    ? clampSharePhotoTransform(transform, w, h)
    : transform;
  const base = hasSize ? coverFitScale(w, h) : 1;
  const renderedW = hasSize ? w * base * clamped.scale : SHARE_CARD_WIDTH;
  const renderedH = hasSize ? h * base * clamped.scale : SHARE_CARD_HEIGHT;
  const left = (SHARE_CARD_WIDTH - renderedW) / 2 + (hasSize ? clamped.x : 0);
  const top = (SHARE_CARD_HEIGHT - renderedH) / 2 + (hasSize ? clamped.y : 0);

  return (
    <div
      style={{
        ...CANVAS_BOX,
        overflow: 'hidden',
        background: '#000000',
      }}
    >
      <img
        src={url}
        alt=""
        crossOrigin="anonymous"
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setNatural({ w: img.naturalWidth, h: img.naturalHeight });
          }
        }}
        style={{
          position: 'absolute',
          left,
          top,
          width: renderedW,
          height: renderedH,
          maxWidth: 'none',
          objectFit: 'cover',
          objectPosition: 'center center',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

/**
 * Fixed 1080×1920 frame. Information layer size/position is independent of background.
 * Photo moves underneath; info + logo never shift or scale with the photo transform.
 */
export function ShareCardFrame({
  backgroundImageUrl,
  photoTransform = DEFAULT_SHARE_PHOTO_TRANSFORM,
  accentColor = ENGINE_CHART_COLOR,
  showLogo = true,
  children,
  className,
}: ShareCardFrameProps) {
  const usingPhoto = Boolean(backgroundImageUrl);
  const logoReady = useShareCardImagesReady();

  return (
    <div
      className={className}
      style={{
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
        minWidth: SHARE_CARD_WIDTH,
        minHeight: SHARE_CARD_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        background: '#000000',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#ffffff',
        boxSizing: 'border-box',
      }}
    >
      {usingPhoto && backgroundImageUrl ? (
        <PhotoBackground url={backgroundImageUrl} transform={photoTransform} />
      ) : (
        <RnkxGradientBackground accentColor={accentColor} />
      )}

      {/* Light CSS scrim for legibility on arbitrary photos — not baked into the export assets */}
      {usingPhoto ? (
        <div
          style={{
            ...CANVAS_BOX,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.12) 32%, rgba(0,0,0,0.18) 62%, rgba(0,0,0,0.42) 100%)',
            pointerEvents: 'none',
          }}
        />
      ) : null}

      <div
        style={{
          ...CANVAS_BOX,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        {showLogo && logoReady ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 96,
              width: SHARE_CARD_WIDTH,
              height: 64,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img
              src={rnkxLogo}
              alt="RNKX"
              crossOrigin="anonymous"
              style={{
                height: 64,
                width: 'auto',
                filter: usingPhoto ? 'drop-shadow(0 2px 10px rgba(0,0,0,0.45))' : undefined,
              }}
            />
          </div>
        ) : null}
        <div style={CANVAS_BOX}>{children}</div>
      </div>
    </div>
  );
}
