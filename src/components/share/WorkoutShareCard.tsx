import { ShareCardFrame } from '@/components/share/ShareCardFrame';
import { ENGINE_CHART_COLOR, RUN_CHART_COLOR } from '@/lib/chartTheme';
import { formatScore } from '@/lib/formatScore';
import {
  DEFAULT_SHARE_PHOTO_TRANSFORM,
  type SharePhotoTransform,
} from '@/lib/sharePhotoTransform';
import type { WorkoutSharePayload } from '@/types/shareCards';
import rnkxSymbol from '@/assets/rnkx-symbol.png';

type WorkoutShareCardProps = {
  payload: WorkoutSharePayload;
  backgroundImageUrl?: string | null;
  photoTransform?: SharePhotoTransform;
};

function Divider() {
  return (
    <div
      style={{
        width: 2,
        alignSelf: 'stretch',
        background: 'rgba(255, 255, 255, 0.92)',
        flexShrink: 0,
      }}
    />
  );
}

/** V1 card: division pill + logo / points / rank — matches social share mock. */
export function WorkoutShareCard({
  payload,
  backgroundImageUrl,
  photoTransform = DEFAULT_SHARE_PHOTO_TRANSFORM,
}: WorkoutShareCardProps) {
  const accent = payload.leagueType === 'run' ? RUN_CHART_COLOR : ENGINE_CHART_COLOR;
  const leagueLabel = payload.leagueType === 'run' ? 'RUN' : 'ENGINE';
  const rankText = payload.seasonRank != null ? `#${payload.seasonRank}` : '—';
  const usingPhoto = Boolean(backgroundImageUrl);
  const textShadow = usingPhoto ? '0 2px 14px rgba(0,0,0,0.55)' : undefined;
  const divisionText = `${payload.division.toUpperCase()} DIVISION`;

  return (
    <ShareCardFrame
      backgroundImageUrl={backgroundImageUrl}
      photoTransform={photoTransform}
      accentColor={accent}
      showLogo={false}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          flex: 1,
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '18px 40px',
            borderRadius: 999,
            border: `2.5px solid ${accent}`,
            boxShadow: usingPhoto ? '0 2px 14px rgba(0,0,0,0.45)' : undefined,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#ffffff',
              textShadow,
              whiteSpace: 'nowrap',
            }}
          >
            {divisionText}
          </p>
        </div>

        <div
          style={{
            marginTop: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 920,
            gap: 0,
          }}
        >
          {/* Brand / league */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 18,
              minWidth: 0,
              padding: '8px 28px',
            }}
          >
            <img
              src={rnkxSymbol}
              alt=""
              crossOrigin="anonymous"
              style={{
                height: 96,
                width: 96,
                objectFit: 'contain',
                filter: usingPhoto ? 'drop-shadow(0 2px 10px rgba(0,0,0,0.45))' : undefined,
              }}
            />
            <p
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#ffffff',
                textShadow,
              }}
            >
              {leagueLabel}
            </p>
          </div>

          <Divider />

          {/* Points */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 18,
              minWidth: 0,
              padding: '8px 28px',
            }}
          >
            <p
              className="font-sans font-bold tabular-nums"
              style={{
                margin: 0,
                fontSize: 92,
                lineHeight: 1,
                color: '#ffffff',
                textShadow,
              }}
            >
              {formatScore(payload.pointsScored)}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#ffffff',
                textShadow,
              }}
            >
              POINTS
            </p>
          </div>

          <Divider />

          {/* Rank */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 18,
              minWidth: 0,
              padding: '8px 28px',
            }}
          >
            <p
              className="font-sans font-bold tabular-nums"
              style={{
                margin: 0,
                fontSize: 92,
                lineHeight: 1,
                color: accent,
                textShadow,
              }}
            >
              {rankText}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#ffffff',
                textShadow,
              }}
            >
              RANK
            </p>
          </div>
        </div>
      </div>
    </ShareCardFrame>
  );
}
