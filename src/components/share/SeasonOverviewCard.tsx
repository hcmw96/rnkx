import { ShareCardFrame } from '@/components/share/ShareCardFrame';
import { formatScore } from '@/lib/formatScore';
import type { SeasonShareStats } from '@/lib/seasonShareStats';

type SeasonOverviewCardProps = {
  stats: SeasonShareStats;
  backgroundImageUrl?: string | null;
};

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 0,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 26,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(244, 244, 245, 0.6)',
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        {label}
      </p>
      <p
        className="font-sans font-bold tabular-nums"
        style={{
          margin: '16px 0 0',
          fontSize: 68,
          lineHeight: 1,
          color: '#bef264',
          textAlign: 'center',
        }}
      >
        {value}
      </p>
    </div>
  );
}

export function SeasonOverviewCard({ stats, backgroundImageUrl }: SeasonOverviewCardProps) {
  const rankText = stats.seasonRank != null ? `#${stats.seasonRank.toLocaleString()}` : '—';
  const displayName = stats.displayName || stats.username;

  return (
    <ShareCardFrame backgroundImageUrl={backgroundImageUrl}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          width: '100%',
          minHeight: 0,
          justifyContent: 'space-between',
        }}
      >
        {/* Upper third — avatar + name */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            paddingTop: 8,
          }}
        >
          {stats.avatarUrl ? (
            <img
              src={stats.avatarUrl}
              alt=""
              crossOrigin="anonymous"
              style={{
                width: 176,
                height: 176,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '4px solid rgba(190, 242, 100, 0.55)',
                boxShadow: '0 0 48px rgba(190, 242, 100, 0.25)',
              }}
            />
          ) : (
            <div
              style={{
                width: 176,
                height: 176,
                borderRadius: '50%',
                background: 'rgba(190, 242, 100, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 72,
                fontWeight: 700,
                color: '#bef264',
                border: '4px solid rgba(190, 242, 100, 0.35)',
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <p
            style={{
              margin: '36px 0 0',
              fontSize: 44,
              fontWeight: 600,
              color: '#ffffff',
              textAlign: 'center',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName}
          </p>
        </div>

        {/* Middle — season + rank */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <p
            className="font-sans font-semibold"
            style={{
              margin: 0,
              fontSize: 40,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'rgba(244, 244, 245, 0.75)',
              textAlign: 'center',
            }}
          >
            {stats.seasonName}
          </p>
          <p
            className="font-sans font-bold tabular-nums"
            style={{
              margin: '20px 0 0',
              fontSize: 88,
              lineHeight: 1,
              color: '#bef264',
              textAlign: 'center',
            }}
          >
            {rankText}
          </p>
          <p
            style={{
              margin: '16px 0 0',
              fontSize: 30,
              color: 'rgba(244, 244, 245, 0.8)',
              textAlign: 'center',
            }}
          >
            {stats.leagueName}
          </p>
        </div>

        {/* Lower third — stats */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: '100%',
            paddingBottom: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              display: 'flex',
              gap: 20,
              alignItems: 'stretch',
            }}
          >
            <StatBlock label="Total Points" value={formatScore(stats.totalPoints)} />
            <StatBlock label="Best Workout" value={formatScore(stats.bestWorkoutScore)} />
            <StatBlock label="Weekly Points" value={formatScore(stats.weeklyPoints)} />
          </div>
        </div>
      </div>
    </ShareCardFrame>
  );
}
