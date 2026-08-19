import { useState, useEffect, type ComponentType } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  connectAppleHealthKit,
  queueOpenDevicesAfterOnboarding,
  type WearableProvider,
} from '@/hooks/useWearableConnect';
import {
  ConnectBadge,
  SettingsGroup,
  SettingsRow,
  SettingsRowDivider,
} from '@/components/settings/SettingsRows';
import {
  StravaLogo,
  WhoopLogo,
  AppleLogo,
  GarminLogo,
} from '@/components/BrandLogos';

export type { WearableProvider };

export type LeagueSupport = 'run' | 'engine' | 'both' | 'recovery';

const nameMap: Record<WearableProvider, string> = {
  strava: 'Strava',
  whoop: 'WHOOP',
  apple: 'Apple Watch',
  garmin: 'Garmin',
  polar: 'Polar',
  coros: 'COROS',
  fitbit: 'Fitbit',
};

const supportMap: Record<WearableProvider, LeagueSupport> = {
  strava: 'run',
  whoop: 'engine',
  apple: 'both',
  garmin: 'both',
  polar: 'both',
  coros: 'both',
  fitbit: 'both',
};

type WearableRow = {
  provider: WearableProvider;
  name: string;
  subtitle: string;
  Logo: ComponentType<{ className?: string }>;
  leagueSupport: LeagueSupport;
  /** Real HealthKit connect in onboarding vs deferred to Settings. */
  mode: 'apple' | 'settings_later';
};

/** Display order: Apple → Garmin (Terra list) → WHOOP → Strava */
const WEARABLE_ROWS: WearableRow[] = [
  {
    provider: 'apple',
    name: 'Apple Watch',
    subtitle: 'Connect via Apple Health',
    Logo: AppleLogo,
    leagueSupport: 'both',
    mode: 'apple',
  },
  {
    provider: 'garmin',
    name: 'Garmin',
    subtitle: 'Connect in Settings',
    Logo: GarminLogo,
    leagueSupport: 'both',
    mode: 'settings_later',
  },
  {
    provider: 'whoop',
    name: 'WHOOP',
    subtitle: 'Connect in Settings',
    Logo: WhoopLogo,
    leagueSupport: 'engine',
    mode: 'settings_later',
  },
  {
    provider: 'strava',
    name: 'Strava',
    subtitle: 'Connect in Settings',
    Logo: StravaLogo,
    leagueSupport: 'run',
    mode: 'settings_later',
  },
];

export const getWearableConfig = (provider: WearableProvider) => {
  return { provider, name: nameMap[provider], leagueSupport: supportMap[provider] };
};

export const getWearablesForLeague = (league: 'run' | 'engine') => {
  const all: { provider: WearableProvider; leagueSupport: LeagueSupport }[] = [
    { provider: 'strava', leagueSupport: 'run' },
    { provider: 'whoop', leagueSupport: 'engine' },
    { provider: 'apple', leagueSupport: 'both' },
    { provider: 'garmin', leagueSupport: 'both' },
    { provider: 'polar', leagueSupport: 'both' },
    { provider: 'coros', leagueSupport: 'both' },
    { provider: 'fitbit', leagueSupport: 'both' },
  ];
  return all.filter((w) => w.leagueSupport === 'both' || w.leagueSupport === league);
};

function LeagueBadge({ league }: { league: 'run' | 'engine' }) {
  const isRun = league === 'run';
  return (
    <span
      className={cn(
        'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        isRun
          ? 'border-electric-cyan/30 bg-electric-cyan/10 text-electric-cyan'
          : 'border-neon-lime/30 bg-neon-lime/10 text-neon-lime',
      )}
    >
      {isRun ? 'Run' : 'Engine'}
    </span>
  );
}

function LeagueBadges({ support }: { support: LeagueSupport }) {
  if (support === 'both') {
    return (
      <div className="flex flex-wrap gap-1">
        <LeagueBadge league="run" />
        <LeagueBadge league="engine" />
      </div>
    );
  }
  if (support === 'run') return <LeagueBadge league="run" />;
  if (support === 'engine') return <LeagueBadge league="engine" />;
  return null;
}

interface OnboardingWearablesProps {
  initialConnected?: WearableProvider[];
  onConnectionsChange?: (connected: WearableProvider[]) => void;
  /** Skip wearable setup entirely */
  onSkip?: () => void;
  /** Advance after connecting one or more devices */
  onContinue?: () => void;
}

const OnboardingWearables = ({
  initialConnected = [],
  onConnectionsChange,
  onSkip,
  onContinue,
}: OnboardingWearablesProps) => {
  /** Only providers with a real successful connection (Apple HealthKit today). */
  const [connected, setConnected] = useState<WearableProvider[]>(
    initialConnected.filter((p) => p === 'apple'),
  );
  const [appleLoading, setAppleLoading] = useState(false);

  useEffect(() => {
    setConnected(initialConnected.filter((p) => p === 'apple'));
  }, [initialConnected]);

  useEffect(() => {
    onConnectionsChange?.(connected);
  }, [connected, onConnectionsChange]);

  const handleAppleConnect = async () => {
    if (connected.includes('apple') || appleLoading) return;
    setAppleLoading(true);
    try {
      const { result, message } = await connectAppleHealthKit();
      if (result === 'connected') {
        setConnected((prev) => (prev.includes('apple') ? prev : [...prev, 'apple']));
        toast.success('Apple Watch connected');
        return;
      }
      if (result === 'denied') {
        toast.message('Apple Health not connected', {
          description:
            message ??
            'Enable access in iOS Settings → Privacy & Security → Health → RNKX.',
        });
        return;
      }
      if (result === 'unavailable') {
        toast.message(message ?? 'Apple Watch connects in the RNKX iPhone app.');
        return;
      }
      toast.error(message ?? 'Could not connect Apple Watch.');
    } finally {
      setAppleLoading(false);
    }
  };

  const handleSettingsLater = (provider: WearableProvider) => {
    queueOpenDevicesAfterOnboarding();
    toast.message(`Connect ${nameMap[provider]} after setup`, {
      description: 'Finish onboarding, then open Settings → Devices & sync.',
    });
  };

  return (
    <div className="space-y-4">
      <SettingsGroup>
        {WEARABLE_ROWS.map((row, index) => {
          const Logo = row.Logo;
          const appleConnected = row.mode === 'apple' && connected.includes('apple');
          const rowLoading = row.mode === 'apple' && appleLoading;

          return (
            <div key={row.provider}>
              {index > 0 ? <SettingsRowDivider /> : null}
              <SettingsRow
                iconNode={
                  <div className="flex h-5 w-5 items-center justify-center">
                    <Logo className="h-5 w-5 max-w-[1.25rem]" />
                  </div>
                }
                title={row.name}
                subtitle={row.subtitle}
                subtitleClassName="line-clamp-2"
                chevron={row.mode === 'settings_later'}
                disabled={rowLoading}
                onClick={() => {
                  if (row.mode === 'apple') {
                    void handleAppleConnect();
                    return;
                  }
                  handleSettingsLater(row.provider);
                }}
                trailing={
                  <div className="flex items-center gap-2">
                    <LeagueBadges support={row.leagueSupport} />
                    {row.mode === 'apple' ? (
                      rowLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                      ) : (
                        <ConnectBadge connected={appleConnected} />
                      )
                    ) : null}
                  </div>
                }
              />
            </div>
          );
        })}
      </SettingsGroup>

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Polar, COROS, and Fitbit are also supported — connect them in Settings after setup.
      </p>

      {connected.length > 0 && onContinue ? (
        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-lg bg-neon-lime py-3 text-sm font-semibold text-black transition-colors hover:bg-neon-lime/90"
        >
          Continue
        </button>
      ) : null}

      {onSkip ? (
        <button
          type="button"
          onClick={onSkip}
          className={cn(
            'w-full py-2 text-sm font-semibold text-foreground/80 underline decoration-foreground/40 underline-offset-4 transition-colors hover:text-neon-lime hover:decoration-neon-lime/60',
            connected.length > 0 && 'text-muted-foreground hover:text-foreground',
          )}
        >
          I&apos;ll do this later.
        </button>
      ) : null}

      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3 shrink-0" aria-hidden />
        <span>Read-only access. We never post or modify your data.</span>
      </div>
    </div>
  );
};

export default OnboardingWearables;
