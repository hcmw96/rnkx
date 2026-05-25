import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '@/lib/shareCardImage';
import rnkxLogo from '@/assets/rnkx-logo.svg';
import type { ReactNode } from 'react';

type ShareCardFrameProps = {
  backgroundImageUrl?: string | null;
  children: ReactNode;
  className?: string;
};

export function ShareCardFrame({ backgroundImageUrl, children, className }: ShareCardFrameProps) {
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
      {backgroundImageUrl ? (
        <img
          src={backgroundImageUrl}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(165deg, #0a0a0a 0%, #121212 45%, #1a1a1a 100%)',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 120% 80% at 50% 100%, rgba(190, 242, 100, 0.35) 0%, rgba(190, 242, 100, 0.08) 40%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 35%, rgba(0,0,0,0.65) 100%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '72px 64px 96px',
          boxSizing: 'border-box',
        }}
      >
        <img
          src={rnkxLogo}
          alt="RNKX"
          crossOrigin="anonymous"
          style={{ height: 56, width: 'auto', marginBottom: 48 }}
        />
        {children}
      </div>
    </div>
  );
}
