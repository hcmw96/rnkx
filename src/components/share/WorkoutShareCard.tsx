import { ShareCardFrame } from '@/components/share/ShareCardFrame';
import { ENGINE_CHART_COLOR, RUN_CHART_COLOR } from '@/lib/chartTheme';
import { formatScore } from '@/lib/formatScore';
import {
  SHARE_CARD_STAT_BLOCK_LEFT,
  SHARE_CARD_STAT_CELL_WIDTH,
  SHARE_CARD_STAT_RULE_WIDTH,
  SHARE_CARD_WIDTH,
  useShareCardImagesReady,
} from '@/lib/shareCardImage';
import {
  DEFAULT_SHARE_PHOTO_TRANSFORM,
  type SharePhotoTransform,
} from '@/lib/sharePhotoTransform';
import type { ReactNode } from 'react';
import type { WorkoutSharePayload } from '@/types/shareCards';
import rnkxSymbol from '@/assets/rnkx-symbol.png';

type WorkoutShareCardProps = {
  payload: WorkoutSharePayload;
  backgroundImageUrl?: string | null;
  photoTransform?: SharePhotoTransform;
};

const FIGURE_H = 92;
/**
 * Inter’s win ascent spills past a 1.0em box. Pad equally above and below the
 * 92px slot so html2canvas can rasterize it without shifting the ink upward.
 */
const FIGURE_OVERFLOW = 20;
/** Inter numerals sit high in the em; shift down so they share the R’s optical center. */
const FIGURE_OPTICAL_NUDGE = 16;
const CAPTION_GAP = 18;
const CAPTION_H = 34;
const CELL_W = SHARE_CARD_STAT_CELL_WIDTH;
const RULE_W = SHARE_CARD_STAT_RULE_WIDTH;
const PILL_H = 62;
const GAP_PILL_TO_STATS = 56;
const STATS_H = FIGURE_H + CAPTION_GAP + CAPTION_H;
/** Top of the 92px figure row — R / score / rank share this band. */
const FIGURE_TOP = 525;
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

function FigureSlot({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        width: CELL_W,
        height: FIGURE_H,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: -FIGURE_OVERFLOW,
          width: CELL_W,
          height: FIGURE_H + FIGURE_OVERFLOW * 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StatFigure({
  text,
  color,
  textShadow,
}: {
  text: string;
  color: string;
  textShadow?: string;
}) {
  return (
    <FigureSlot>
      <span
        className="font-sans font-bold tabular-nums"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: FIGURE_H,
          fontSize: FIGURE_H,
          lineHeight: 1,
          position: 'relative',
          top: FIGURE_OPTICAL_NUDGE,
          color,
          textShadow,
          whiteSpace: 'nowrap',
          overflow: 'visible',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {text}
      </span>
    </FigureSlot>
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
  const logoReady = useShareCardImagesReady();
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

      <div
        style={{
          position: 'absolute',
          left: SHARE_CARD_STAT_BLOCK_LEFT,
          top: FIGURE_TOP,
          width: SHARE_CARD_WIDTH - SHARE_CARD_STAT_BLOCK_LEFT * 2,
          height: STATS_H,
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            width: CELL_W,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: CAPTION_GAP,
          }}
        >
          <FigureSlot>
            {logoReady ? (
              <img
                src={rnkxSymbol}
                alt=""
                crossOrigin="anonymous"
                style={{
                  height: FIGURE_H,
                  width: FIGURE_H,
                  objectFit: 'contain',
                  objectPosition: 'center',
                  display: 'block',
                  filter: usingPhoto ? 'drop-shadow(0 2px 10px rgba(0,0,0,0.45))' : undefined,
                }}
              />
            ) : null}
          </FigureSlot>
          <Caption text={leagueLabel} textShadow={textShadow} />
        </div>

        <div
          style={{
            width: RULE_W,
            flexShrink: 0,
            background: 'rgba(255, 255, 255, 0.92)',
          }}
        />

        <div
          style={{
            width: CELL_W,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: CAPTION_GAP,
          }}
        >
          <StatFigure
            text={formatScore(payload.pointsScored)}
            color="#ffffff"
            textShadow={textShadow}
          />
          <Caption text="POINTS" textShadow={textShadow} />
        </div>

        <div
          style={{
            width: RULE_W,
            flexShrink: 0,
            background: 'rgba(255, 255, 255, 0.92)',
          }}
        />

        <div
          style={{
            width: CELL_W,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: CAPTION_GAP,
          }}
        >
          <StatFigure text={rankText} color={accent} textShadow={textShadow} />
          <Caption text="RANK" textShadow={textShadow} />
        </div>
      </div>
    </ShareCardFrame>
  );
}
