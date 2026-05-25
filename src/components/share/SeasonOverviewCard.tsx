import { ShareCardFrame } from '@/components/share/ShareCardFrame';
import type { SeasonShareStats } from '@/lib/seasonShareStats';

type SeasonOverviewCardProps = {
  stats: SeasonShareStats;
  backgroundImageUrl?: string | null;
};

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <p
        style={{
          margin: 0,
          fontSize: 28,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(244, 244, 245, 0.65)',
          fontWeight: 500,
        }}
      >
        {label}
      </p>
      <p
        className="font-display"
        style={{
          margin: '12px 0 0',
          fontSize: 72,
          lineHeight: 1,
          color: '#bef264',
        }}
      >
        {value}
      </p>
    </div>
  );
}

export function SeasonOverviewCard({ stats, backgroundImageUrl }: SeasonOverviewCardProps) {
  const rankText = stats.seasonRank != null ? `#${stats.seasonRank}` : '—';

  return (
    <ShareCardFrame backgroundImageUrl={backgroundImageUrl}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, width: '100%' }}>
        {stats.avatarUrl ? (
          <img
            src={stats.avatarUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              width: 160,
              height: 160,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '4px solid rgba(190, 242, 100, 0.5)',
            }}
          />
        ) : (
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: '50%',
              background: 'rgba(190, 242, 100, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 64,
              fontWeight: 700,
              color: '#bef264',
            }}
          >
            {(stats.displayName || stats.username).charAt(0).toUpperCase()}
          </div>
        )}
        <p style={{ margin: '32px 0 8px', fontSize: 40, fontWeight: 600 }}>@{stats.username}</p>
        <p className="font-display" style={{ margin: 0, fontSize: 56, color: '#bef264' }}>
          {rankText}
        </p>
        <p style={{ margin: '12px 0 0', fontSize: 32, color: 'rgba(244, 244, 245, 0.85)' }}>{stats.leagueName}</p>
        <p
          style={{
            margin: '48px 0 0',
            fontSize: 36,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'rgba(244, 244, 245, 0.7)',
            textAlign: 'center',
          }}
        >
          {stats.seasonName}
        </p>
        <div
          style={{
            marginTop: 'auto',
            width: '100%',
            display: 'flex',
            gap: 24,
            paddingTop: 80,
          }}
        >
          <StatBlock label="Total Points" value={stats.totalPoints.toLocaleString()} />
          <StatBlock label="Best Workout" value={stats.bestWorkoutScore.toLocaleString()} />
          <StatBlock label="Weekly Points" value={stats.weeklyPoints.toLocaleString()} />
        </div>
      </div>
    </ShareCardFrame>
  );
}
