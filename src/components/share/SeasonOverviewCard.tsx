import { ShareCardFrame } from '@/components/share/ShareCardFrame';
import { ENGINE_CHART_COLOR } from '@/lib/chartTheme';
import { formatScore } from '@/lib/formatScore';
import type { SeasonShareStats } from '@/lib/seasonShareStats';
import rnkxSymbol from '@/assets/rnkx-symbol.png';

type SeasonOverviewCardProps = {
  stats: SeasonShareStats;
  backgroundImageUrl?: string | null;
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

function StatColumn({
  value,
  label,
  valueColor = '#ffffff',
  textShadow,
}: {
  value: string;
  label: string;
  valueColor?: string;
  textShadow?: string;
}) {
  return (
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
          fontSize: 72,
          lineHeight: 1,
          color: valueColor,
          textShadow,
          textAlign: 'center',
        }}
      >
        {value}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#ffffff',
          textShadow,
          textAlign: 'center',
        }}
      >
        {label}
      </p>
    </div>
  );
}

export function SeasonOverviewCard({ stats, backgroundImageUrl }: SeasonOverviewCardProps) {
  const accent = ENGINE_CHART_COLOR;
  const rankText = stats.seasonRank != null ? `#${stats.seasonRank}` : '—';
  const displayName = stats.displayName || stats.username;
  const usingPhoto = Boolean(backgroundImageUrl);
  const textShadow = usingPhoto ? '0 2px 14px rgba(0,0,0,0.55)' : undefined;
  const pillText = (stats.seasonName || 'SEASON').toUpperCase();

  return (
    <ShareCardFrame
      backgroundImageUrl={backgroundImageUrl}
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
          padding: '160px 64px 120px',
          boxSizing: 'border-box',
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
            maxWidth: '100%',
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
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 880,
            }}
          >
            {pillText}
          </p>
        </div>

        <p
          style={{
            margin: '36px 0 0',
            fontSize: 36,
            fontWeight: 600,
            color: '#ffffff',
            textAlign: 'center',
            textShadow,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </p>

        <div
          style={{
            marginTop: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 920,
          }}
        >
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
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#ffffff',
                textShadow,
                textAlign: 'center',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {stats.leagueName || 'RNKX'}
            </p>
          </div>

          <Divider />

          <StatColumn
            value={formatScore(stats.totalPoints)}
            label="POINTS"
            textShadow={textShadow}
          />

          <Divider />

          <StatColumn
            value={rankText}
            label="RANK"
            valueColor={accent}
            textShadow={textShadow}
          />
        </div>

        <div
          style={{
            marginTop: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 920,
          }}
        >
          <StatColumn
            value={formatScore(stats.bestWorkoutScore)}
            label="BEST"
            valueColor={accent}
            textShadow={textShadow}
          />
          <Divider />
          <StatColumn
            value={formatScore(stats.weeklyPoints)}
            label="WEEKLY"
            valueColor={accent}
            textShadow={textShadow}
          />
        </div>
      </div>
    </ShareCardFrame>
  );
}
