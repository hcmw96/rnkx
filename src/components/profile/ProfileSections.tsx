import { Award, BarChart3 } from 'lucide-react';
import { AchievementBadge } from '@/components/profile/AchievementBadge';
import type { AchievementState } from '@/lib/achievements';
import type { ProfileCareerStats } from '@/lib/profileStats';
import { cn } from '@/lib/utils';

/** Profile score display — matches season card precision (e.g. 2,177.014). */
export function formatProfileScore(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

/** "Season 1 · Spring 2026" → "SEASON 1 • SPRING 2026" */
export function formatSeasonHeading(seasonDisplay: string): string {
  return seasonDisplay.replace(/\s·\s/g, ' • ').toUpperCase();
}

type ProfileIdentityProps = {
  displayName: string;
  username: string | null;
  isPremium: boolean | null;
  countryName: string | null;
  countryFlag: string;
  memberSince: string;
  avatarUrl: string | null;
  initials: string;
  uploading: boolean;
  onAvatarClick: () => void;
};

function ProfileIdentity({
  displayName,
  username,
  isPremium,
  countryName,
  countryFlag,
  memberSince,
  avatarUrl,
  initials,
  uploading,
  onAvatarClick,
}: ProfileIdentityProps) {
  const locationLine = [countryName ? `${countryFlag ? `${countryFlag} ` : ''}${countryName}` : null, memberSince]
    .filter(Boolean)
    .join(' · ');

  return (
    <header className="flex items-center gap-4">
      <button
        type="button"
        onClick={onAvatarClick}
        disabled={uploading}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-neon-lime/50 bg-muted transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        aria-label="Change profile photo"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg font-semibold tracking-wide text-foreground">
            {initials}
          </span>
        )}
        {uploading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-medium">
            …
          </span>
        ) : null}
      </button>

      <div className="min-w-0 flex-1 space-y-1 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate font-sans text-xl font-bold text-foreground">{displayName}</h1>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              isPremium
                ? 'border border-neon-lime/35 bg-zinc-950 text-neon-lime'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {isPremium ? 'Premium' : 'Free'}
          </span>
        </div>
        <p className="truncate text-sm font-medium text-neon-lime">@{username ?? '—'}</p>
        {locationLine ? <p className="text-xs text-muted-foreground">{locationLine}</p> : null}
      </div>
    </header>
  );
}

type ProfileSeasonSectionProps = {
  seasonDisplay: string;
  combinedScore: number;
  engineScore: number;
  runScore: number;
  standingPercent: number;
  topPercent: number;
};

function ProfileSeasonSection({
  seasonDisplay,
  combinedScore,
  engineScore,
  runScore,
  standingPercent,
  topPercent,
}: ProfileSeasonSectionProps) {
  return (
    <div className="space-y-3 border-t border-border/60 pt-4">
      <p className="type-section-label">{formatSeasonHeading(seasonDisplay)}</p>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="type-stat text-neon-lime">{formatProfileScore(combinedScore)}</p>
          <p className="type-meta">Combined season score</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <span className="rounded-full border border-border bg-zinc-950/60 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            Engine {formatProfileScore(engineScore)}
          </span>
          <span className="rounded-full border border-border bg-zinc-950/60 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            Run {formatProfileScore(runScore)}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Season standing</span>
          <span>Top {topPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-neon-lime to-amber-400 transition-all"
            style={{ width: `${standingPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

type ProfileOverviewCardProps = ProfileIdentityProps & ProfileSeasonSectionProps;

export function ProfileOverviewCard(props: ProfileOverviewCardProps) {
  const {
    seasonDisplay,
    combinedScore,
    engineScore,
    runScore,
    standingPercent,
    topPercent,
    ...identityProps
  } = props;

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <ProfileIdentity {...identityProps} />
      <ProfileSeasonSection
        seasonDisplay={seasonDisplay}
        combinedScore={combinedScore}
        engineScore={engineScore}
        runScore={runScore}
        standingPercent={standingPercent}
        topPercent={topPercent}
      />
    </article>
  );
}

function CareerStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="type-meta uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 font-sans text-base font-semibold tabular-nums leading-tight text-foreground">
        {value}
      </p>
    </div>
  );
}

type ProfileProgressCardProps = {
  careerStats: ProfileCareerStats | null;
  achievements: AchievementState[];
};

export function ProfileProgressCard({ careerStats, achievements }: ProfileProgressCardProps) {
  return (
    <article className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <BarChart3 className="h-5 w-5 text-neon-lime" aria-hidden />
        <h2 className="type-section-label">Career</h2>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <CareerStat label="Scored workouts" value={String(careerStats?.totalScoredWorkouts ?? 0)} />
        <CareerStat
          label="All-time points"
          value={(careerStats?.allTimePoints ?? 0).toLocaleString()}
        />
        <CareerStat
          label="Best session"
          value={`${(careerStats?.bestSession ?? 0).toLocaleString()} pts`}
        />
        <CareerStat label="Top activity" value={careerStats?.topActivityType ?? '—'} />
      </div>

      <div className="space-y-3 border-t border-border/60 pt-4">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-neon-lime" aria-hidden />
          <h2 className="type-section-label">Achievements</h2>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {achievements.map((badge) => (
            <AchievementBadge key={badge.id} achievement={badge} />
          ))}
        </div>
      </div>
    </article>
  );
}
