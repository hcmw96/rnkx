import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '@/lib/shareCardImage';
import { ENGINE_CHART_COLOR } from '@/lib/chartTheme';
import {
  clampSharePhotoTransform,
  coverFitScale,
  DEFAULT_SHARE_PHOTO_TRANSFORM,
  type SharePhotoTransform,
} from '@/lib/sharePhotoTransform';
import rnkxLogo from '@/assets/rnkx-logo.svg';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type ShareCardFrameProps = {
  backgroundImageUrl?: string | null;
  photoTransform?: SharePhotoTransform;
  /** League accent for the RNKX gradient (defaults to Engine lime). */
  accentColor?: string;
  children: ReactNode;
  className?: string;
};

function RnkxGradientBackground({ accentColor }: { accentColor: string }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#050505',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 28%, transparent 52%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 120% 70% at 50% 115%, ${accentColor} 0%, transparent 58%)`,
          opacity: 0.42,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(0deg, ${accentColor} 0%, transparent 42%)`,
          opacity: 0.14,
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

  const w = natural?.w ?? SHARE_CARD_WIDTH;
  const h = natural?.h ?? SHARE_CARD_HEIGHT;
  const clamped = clampSharePhotoTransform(transform, w, h);
  const base = coverFitScale(w, h);
  const renderedW = w * base * clamped.scale;
  const renderedH = h * base * clamped.scale;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: '#050505',
      }}
    >
      <img
        src={url}
        alt=""
        crossOrigin="anonymous"
        draggable={false}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: renderedW,
          height: renderedH,
          maxWidth: 'none',
          transform: `translate(calc(-50% + ${clamped.x}px), calc(-50% + ${clamped.y}px))`,
          transformOrigin: 'center center',
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
  children,
  className,
}: ShareCardFrameProps) {
  const usingPhoto = Boolean(backgroundImageUrl);

  return (
    <div
      className={className}
      style={{
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#f4f4f5',
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
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.12) 32%, rgba(0,0,0,0.18) 62%, rgba(0,0,0,0.42) 100%)',
            pointerEvents: 'none',
          }}
        />
      ) : null}

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '96px 72px 120px',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      >
        <img
          src={rnkxLogo}
          alt="RNKX"
          crossOrigin="anonymous"
          style={{
            height: 64,
            width: 'auto',
            flexShrink: 0,
            filter: usingPhoto ? 'drop-shadow(0 2px 10px rgba(0,0,0,0.45))' : undefined,
          }}
        />
        <div
          style={{
            flex: 1,
            width: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
