import { ShareCardFrame } from '@/components/share/ShareCardFrame';
import { ENGINE_CHART_COLOR, RUN_CHART_COLOR } from '@/lib/chartTheme';
import { formatScore } from '@/lib/formatScore';
import {
  SHARE_CARD_STAT_BLOCK_LEFT,
  SHARE_CARD_STAT_CELL_WIDTH,
  SHARE_CARD_STAT_RULE_WIDTH,
  SHARE_CARD_WIDTH,
} from '@/lib/shareCardImage';
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
const CAPTION_GAP = 18;
const CAPTION_H = 34;
const CELL_W = SHARE_CARD_STAT_CELL_WIDTH;
const RULE_W = SHARE_CARD_STAT_RULE_WIDTH;
const ICON_INSET = (CELL_W - FIGURE_H) / 2;
const PILL_H = 62;
const GAP_PILL_TO_STATS = 56;
/** Pixel Y of the figure row on the 1080×1920 canvas — not a % of any box. */
const FIGURE_TOP = 525;
const CAPTION_TOP = FIGURE_TOP + FIGURE_H + CAPTION_GAP;
const PILL_TOP = FIGURE_TOP - GAP_PILL_TO_STATS - PILL_H;

function Caption({ text, textShadow }: { text: string; textShadow?: string }) {
  return (
    <p
      style={{
        margin: 0,
        width: CELL_W,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#ffffff',
        textShadow,
        textAlign: 'center',
        lineHeight: `${CAPTION_H}px`,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </p>
  );
}

function cellLeft(index: number): number {
  return SHARE_CARD_STAT_BLOCK_LEFT + index * (CELL_W + RULE_W);
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
          left: 0,
          top: PILL_TOP,
          width: SHARE_CARD_WIDTH,
          height: PILL_H,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            padding: '18px 40px',
            borderRadius: 999,
            border: `2.5px solid ${accent}`,
            boxShadow: usingPhoto ? '0 2px 14px rgba(0,0,0,0.45)' : undefined,
            boxSizing: 'border-box',
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
              lineHeight: '26px',
            }}
          >
            {divisionText}
          </p>
        </div>
      </div>

      {[0, 1].map((i) => (
        <div
          key={`rule-${i}`}
          style={{
            position: 'absolute',
            left: cellLeft(i) + CELL_W,
            top: FIGURE_TOP,
            width: RULE_W,
            height: FIGURE_H + CAPTION_GAP + CAPTION_H,
            background: 'rgba(255, 255, 255, 0.92)',
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          left: cellLeft(0),
          top: FIGURE_TOP,
          width: CELL_W,
          height: FIGURE_H,
        }}
      >
        <img
          src={rnkxSymbol}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: 'absolute',
            left: ICON_INSET,
            bottom: 0,
            height: FIGURE_H,
            width: FIGURE_H,
            objectFit: 'contain',
            objectPosition: 'center bottom',
            display: 'block',
            filter: usingPhoto ? 'drop-shadow(0 2px 10px rgba(0,0,0,0.45))' : undefined,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: cellLeft(0),
          top: CAPTION_TOP,
          width: CELL_W,
          height: CAPTION_H,
        }}
      >
        <Caption text={leagueLabel} textShadow={textShadow} />
      </div>

      <p
        className="font-sans font-bold tabular-nums"
        style={{
          position: 'absolute',
          left: cellLeft(1),
          top: FIGURE_TOP,
          width: CELL_W,
          height: FIGURE_H,
          margin: 0,
          fontSize: FIGURE_H,
          lineHeight: `${FIGURE_H}px`,
          color: '#ffffff',
          textShadow,
          textAlign: 'center',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatScore(payload.pointsScored)}
      </p>
      <div
        style={{
          position: 'absolute',
          left: cellLeft(1),
          top: CAPTION_TOP,
          width: CELL_W,
          height: CAPTION_H,
        }}
      >
        <Caption text="POINTS" textShadow={textShadow} />
      </div>

      <p
        className="font-sans font-bold tabular-nums"
        style={{
          position: 'absolute',
          left: cellLeft(2),
          top: FIGURE_TOP,
          width: CELL_W,
          height: FIGURE_H,
          margin: 0,
          fontSize: FIGURE_H,
          lineHeight: `${FIGURE_H}px`,
          color: accent,
          textShadow,
          textAlign: 'center',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rankText}
      </p>
      <div
        style={{
          position: 'absolute',
          left: cellLeft(2),
          top: CAPTION_TOP,
          width: CELL_W,
          height: CAPTION_H,
        }}
      >
        <Caption text="RANK" textShadow={textShadow} />
      </div>
    </ShareCardFrame>
  );
}
