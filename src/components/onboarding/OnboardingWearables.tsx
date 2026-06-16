import { useState, useEffect, type ComponentType } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useWearableConnect } from '@/hooks/useWearableConnect';
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

export type WearableProvider =
  | 'strava'
  | 'whoop'
  | 'garmin'
  | 'apple'
  | 'polar'
  | 'coros'
  | 'fitbit'
  | 'oura'
  | 'samsung'
  | 'myzone';

export type LeagueSupport = 'run' | 'engine' | 'both' | 'recovery';

const nameMap: Record<WearableProvider, string> = {
  strava: 'Strava',
  whoop: 'WHOOP',
  apple: 'Apple Watch',
  garmin: 'Garmin',
  polar: 'Polar',
  coros: 'COROS',
  fitbit: 'Fitbit',
  oura: 'Oura',
  samsung: 'Samsung',
  myzone: 'Myzone',
};

const supportMap: Record<WearableProvider, LeagueSupport> = {
  strava: 'run',
  whoop: 'engine',
  apple: 'both',
  garmin: 'both',
  polar: 'both',
  coros: 'both',
  fitbit: 'both',
  oura: 'engine',
  samsung: 'both',
  myzone: 'engine',
};

type WearableRow = {
  provider: WearableProvider;
  name: string;
  subtitle: string;
  Logo: ComponentType<{ className?: string }>;
  leagueSupport: LeagueSupport;
};

/** Display order: Apple → Garmin → WHOOP → Strava */
const WEARABLE_ROWS: WearableRow[] = [
  {
    provider: 'apple',
    name: 'Apple Watch',
    subtitle: 'Manual sync',
    Logo: AppleLogo,
    leagueSupport: 'both',
  },
  {
    provider: 'garmin',
    name: 'Garmin',
    subtitle: 'Automatic sync',
    Logo: GarminLogo,
    leagueSupport: 'both',
  },
  {
    provider: 'whoop',
    name: 'WHOOP',
    subtitle: 'Automatic sync',
    Logo: WhoopLogo,
    leagueSupport: 'engine',
  },
  {
    provider: 'strava',
    name: 'Strava',
    subtitle: 'Run activities',
    Logo: StravaLogo,
    leagueSupport: 'run',
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
    { provider: 'oura', leagueSupport: 'engine' },
    { provider: 'samsung', leagueSupport: 'both' },
    { provider: 'myzone', leagueSupport: 'engine' },
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
  const [connected, setConnected] = useState<WearableProvider[]>(initialConnected);

  const { connect, loading } = useWearableConnect({
    onSuccess: (provider) => {
      setConnected((prev) => {
        if (prev.includes(provider)) return prev;
        return [...prev, provider];
      });
      toast.success(`${nameMap[provider]} connected`);
    },
  });

  useEffect(() => {
    setConnected(initialConnected);
  }, [initialConnected]);

  useEffect(() => {
    onConnectionsChange?.(connected);
  }, [connected, onConnectionsChange]);

  const handleConnect = async (provider: WearableProvider) => {
    if (connected.includes(provider)) return;
    await connect(provider);
  };

  const isConnected = (provider: WearableProvider) => {
    if (provider === 'garmin') {
      return connected.some((p) =>
        ['garmin', 'polar', 'coros', 'fitbit', 'oura', 'samsung', 'myzone'].includes(p),
      );
    }
    return connected.includes(provider);
  };

  const isLoading = (provider: WearableProvider) => {
    if (provider === 'garmin') {
      return loading === 'garmin' && !isConnected('garmin');
    }
    return loading === provider && !isConnected(provider);
  };

  return (
    <div className="space-y-4">
      <SettingsGroup>
        {WEARABLE_ROWS.map((row, index) => {
          const active = isConnected(row.provider);
          const rowLoading = isLoading(row.provider);
          const Logo = row.Logo;

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
                chevron={false}
                disabled={rowLoading}
                onClick={() => void handleConnect(row.provider)}
                trailing={
                  <div className="flex items-center gap-2">
                    <LeagueBadges support={row.leagueSupport} />
                    {rowLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                    ) : (
                      <ConnectBadge connected={active} />
                    )}
                  </div>
                }
              />
            </div>
          );
        })}
      </SettingsGroup>

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
