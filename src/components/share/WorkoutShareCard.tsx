import { ShareCardFrame } from '@/components/share/ShareCardFrame';
import { ENGINE_CHART_COLOR, RUN_CHART_COLOR } from '@/lib/chartTheme';
import { formatScore } from '@/lib/formatScore';
import {
  DEFAULT_SHARE_PHOTO_TRANSFORM,
  type SharePhotoTransform,
} from '@/lib/sharePhotoTransform';
import type { WorkoutSharePayload } from '@/types/shareCards';

type WorkoutShareCardProps = {
  payload: WorkoutSharePayload;
  backgroundImageUrl?: string | null;
  photoTransform?: SharePhotoTransform;
};

/** V1 card: logo, league, score, rank, division — nothing else. */
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

  return (
    <ShareCardFrame
      backgroundImageUrl={backgroundImageUrl}
      photoTransform={photoTransform}
      accentColor={accent}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          width: '100%',
          gap: 0,
        }}
      >
        <p
          style={{
            margin: '80px 0 0',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: accent,
            textShadow,
          }}
        >
          {leagueLabel}
        </p>

        <p
          className="font-sans font-bold tabular-nums"
          style={{
            margin: '36px 0 0',
            fontSize: 168,
            lineHeight: 1,
            color: accent,
            textShadow,
          }}
        >
          +{formatScore(payload.pointsScored)}
        </p>

        <div
          style={{
            marginTop: 96,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 48,
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                margin: 0,
                fontSize: 24,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: usingPhoto ? 'rgba(244, 244, 245, 0.72)' : 'rgba(244, 244, 245, 0.55)',
                fontWeight: 600,
                textShadow,
              }}
            >
              Rank
            </p>
            <p
              className="font-sans font-bold tabular-nums"
              style={{
                margin: '14px 0 0',
                fontSize: 72,
                lineHeight: 1,
                color: '#f4f4f5',
                textShadow,
              }}
            >
              {rankText}
            </p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                margin: 0,
                fontSize: 24,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: usingPhoto ? 'rgba(244, 244, 245, 0.72)' : 'rgba(244, 244, 245, 0.55)',
                fontWeight: 600,
                textShadow,
              }}
            >
              Division
            </p>
            <p
              className="font-sans font-bold"
              style={{
                margin: '14px 0 0',
                fontSize: 56,
                lineHeight: 1.1,
                color: '#f4f4f5',
                textShadow,
              }}
            >
              {payload.division}
            </p>
          </div>
        </div>
      </div>
    </ShareCardFrame>
  );
}
