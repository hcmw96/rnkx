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
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, #050505 0%, #0a0a0a 35%, #0d1208 70%, #0a0f06 100%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(190, 242, 100, 0.22) 0%, transparent 55%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(ellipse 100% 70% at 50% 100%, rgba(190, 242, 100, 0.4) 0%, rgba(132, 204, 22, 0.12) 35%, transparent 65%)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at 20% 30%, rgba(34, 211, 238, 0.06) 0%, transparent 40%)',
              pointerEvents: 'none',
            }}
          />
        </>
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.35) 75%, rgba(0,0,0,0.55) 100%)',
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
          padding: '64px 56px 72px',
          boxSizing: 'border-box',
        }}
      >
        <img
          src={rnkxLogo}
          alt="RNKX"
          crossOrigin="anonymous"
          style={{ height: 52, width: 'auto', flexShrink: 0, marginBottom: 24 }}
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
