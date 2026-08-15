import { ShareCardFrame } from '@/components/share/ShareCardFrame';
import { ENGINE_CHART_COLOR, RUN_CHART_COLOR } from '@/lib/chartTheme';
import { formatScore } from '@/lib/formatScore';
import { SHARE_CARD_HEIGHT } from '@/lib/shareCardImage';
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

const FIGURE_H = 92;
const STAT_CENTER_Y = Math.round(SHARE_CARD_HEIGHT * 0.28);

function Caption({ text, textShadow }: { text: string; textShadow?: string }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#ffffff',
        textShadow,
        textAlign: 'center',
      }}
    >
      {text}
    </p>
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
          position: 'absolute',
          top: STAT_CENTER_Y,
          left: 64,
          right: 64,
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
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
            display: 'grid',
            gridTemplateColumns: '1fr 2px 1fr 2px 1fr',
            gridTemplateRows: `${FIGURE_H}px auto`,
            rowGap: 18,
            width: '100%',
            maxWidth: 920,
            alignItems: 'stretch',
          }}
        >
          <div
            style={{
              gridColumn: 1,
              gridRow: 1,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <img
              src={rnkxSymbol}
              alt=""
              crossOrigin="anonymous"
              style={{
                height: FIGURE_H,
                width: FIGURE_H,
                objectFit: 'contain',
                objectPosition: 'center bottom',
                display: 'block',
                filter: usingPhoto ? 'drop-shadow(0 2px 10px rgba(0,0,0,0.45))' : undefined,
              }}
            />
          </div>
          <div style={{ gridColumn: 1, gridRow: 2 }}>
            <Caption text={leagueLabel} textShadow={textShadow} />
          </div>

          <div
            style={{
              gridColumn: 2,
              gridRow: '1 / 3',
              width: 2,
              justifySelf: 'center',
              background: 'rgba(255, 255, 255, 0.92)',
            }}
          />

          <div
            style={{
              gridColumn: 3,
              gridRow: 1,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <p
              className="font-sans font-bold tabular-nums"
              style={{
                margin: 0,
                fontSize: FIGURE_H,
                lineHeight: 1,
                color: '#ffffff',
                textShadow,
              }}
            >
              {formatScore(payload.pointsScored)}
            </p>
          </div>
          <div style={{ gridColumn: 3, gridRow: 2 }}>
            <Caption text="POINTS" textShadow={textShadow} />
          </div>

          <div
            style={{
              gridColumn: 4,
              gridRow: '1 / 3',
              width: 2,
              justifySelf: 'center',
              background: 'rgba(255, 255, 255, 0.92)',
            }}
          />

          <div
            style={{
              gridColumn: 5,
              gridRow: 1,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <p
              className="font-sans font-bold tabular-nums"
              style={{
                margin: 0,
                fontSize: FIGURE_H,
                lineHeight: 1,
                color: accent,
                textShadow,
              }}
            >
              {rankText}
            </p>
          </div>
          <div style={{ gridColumn: 5, gridRow: 2 }}>
            <Caption text="RANK" textShadow={textShadow} />
          </div>
        </div>
      </div>
    </ShareCardFrame>
  );
}
