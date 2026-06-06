import { ShareCardFrame } from '@/components/share/ShareCardFrame';
import { formatScore } from '@/lib/formatScore';
import type { WorkoutSharePayload } from '@/types/shareCards';

type WorkoutShareCardProps = {
  payload: WorkoutSharePayload;
  backgroundImageUrl?: string | null;
};

function formatDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export function WorkoutShareCard({ payload, backgroundImageUrl }: WorkoutShareCardProps) {
  const keyStatLabel = payload.leagueType === 'engine' ? 'Avg HR%' : 'Avg Pace';
  const keyStatValue =
    payload.leagueType === 'engine'
      ? payload.avgHrPercent != null
        ? `${Math.round(payload.avgHrPercent)}%`
        : '—'
      : payload.avgPaceDisplay ?? '—';

  const rankText = payload.seasonRank != null ? `#${payload.seasonRank}` : '—';

  return (
    <ShareCardFrame backgroundImageUrl={backgroundImageUrl}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginBottom: 40 }}>
          {payload.avatarUrl ? (
            <img
              src={payload.avatarUrl}
              alt=""
              crossOrigin="anonymous"
              style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid rgba(190, 242, 100, 0.45)',
              }}
            />
          ) : (
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: 'rgba(190, 242, 100, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
                fontWeight: 700,
                color: '#bef264',
              }}
            >
              {payload.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 36, fontWeight: 600 }}>@{payload.username}</p>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 32,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(244, 244, 245, 0.75)',
          }}
        >
          {payload.activityLabel}
        </p>
        <p
          className="font-display"
          style={{
            margin: '24px 0 0',
            fontSize: 140,
            lineHeight: 1,
            color: '#bef264',
          }}
        >
          +{formatScore(payload.pointsScored)}
        </p>
        <p style={{ margin: '16px 0 0', fontSize: 28, color: 'rgba(244, 244, 245, 0.65)' }}>points</p>
        <div
          style={{
            marginTop: 64,
            display: 'flex',
            gap: 48,
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 26, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(244,244,245,0.6)' }}>
              {keyStatLabel}
            </p>
            <p className="font-display" style={{ margin: '12px 0 0', fontSize: 52, color: '#f4f4f5' }}>
              {keyStatValue}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 26, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(244,244,245,0.6)' }}>
              Duration
            </p>
            <p className="font-display" style={{ margin: '12px 0 0', fontSize: 52, color: '#f4f4f5' }}>
              {formatDuration(payload.durationMin)}
            </p>
          </div>
        </div>
        <div style={{ marginTop: 'auto', textAlign: 'center', paddingTop: 80 }}>
          <p style={{ margin: 0, fontSize: 28, color: 'rgba(244, 244, 245, 0.65)' }}>Season rank</p>
          <p className="font-display" style={{ margin: '12px 0 0', fontSize: 64, color: '#bef264' }}>
            {rankText}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 28, color: 'rgba(244, 244, 245, 0.55)' }}>{payload.leagueLabel}</p>
        </div>
      </div>
    </ShareCardFrame>
  );
}
