import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, Lock, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWearableConnect } from '@/hooks/useWearableConnect';
import { 
  StravaLogo, WhoopLogo, AppleLogo,
  GarminLogo, PolarLogo, CorosLogo, FitbitLogo, OuraLogo, SamsungLogo
} from '@/components/BrandLogos';

export type WearableProvider = 'strava' | 'whoop' | 'garmin' | 'apple' | 'polar' | 'coros' | 'fitbit' | 'oura' | 'samsung' | 'myzone';

export type LeagueSupport = 'run' | 'engine' | 'both' | 'recovery';

interface WearableCardConfig {
  name: string;
  provider: WearableProvider;
  Logo: React.ComponentType<{ className?: string }>;
  leagueSupport: LeagueSupport;
}

// Dedicated cards (non-Terra)
const dedicatedCards: WearableCardConfig[] = [
  { name: 'Strava', provider: 'strava', Logo: StravaLogo, leagueSupport: 'run' },
  { name: 'WHOOP', provider: 'whoop', Logo: WhoopLogo, leagueSupport: 'engine' },
  { name: 'Apple Health', provider: 'apple', Logo: AppleLogo, leagueSupport: 'both' },
];

// Terra provider logos for the consolidated card
const terraLogos = [
  { Logo: GarminLogo, name: 'Garmin' },
  { Logo: PolarLogo, name: 'Polar' },
  { Logo: CorosLogo, name: 'COROS' },
  { Logo: FitbitLogo, name: 'Fitbit' },
  { Logo: OuraLogo, name: 'Oura' },
  { Logo: SamsungLogo, name: 'Samsung' },
];

// Export helpers for LeagueSelect compatibility
const nameMap: Record<WearableProvider, string> = {
  strava: 'Strava', whoop: 'WHOOP', apple: 'Apple Health', garmin: 'Garmin',
  polar: 'Polar', coros: 'COROS', fitbit: 'Fitbit', oura: 'Oura',
  samsung: 'Samsung', myzone: 'Myzone',
};

const supportMap: Record<WearableProvider, LeagueSupport> = {
  strava: 'run', whoop: 'engine', apple: 'both', garmin: 'both',
  polar: 'both', coros: 'both', fitbit: 'both', oura: 'engine',
  samsung: 'both', myzone: 'engine',
};

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
  return all.filter(w => w.leagueSupport === 'both' || w.leagueSupport === league);
};

interface OnboardingWearablesProps {
  onConnectionsChange?: (connected: WearableProvider[]) => void;
}

const OnboardingWearables = ({ onConnectionsChange }: OnboardingWearablesProps) => {
  const [connected, setConnected] = useState<WearableProvider[]>([]);

  const { connect, loading } = useWearableConnect({
    onSuccess: (provider) => {
      setConnected(prev => [...prev, provider]);
    },
  });

  useEffect(() => {
    onConnectionsChange?.(connected);
  }, [connected, onConnectionsChange]);

  const handleConnect = async (provider: WearableProvider) => {
    if (connected.includes(provider)) return;
    await connect(provider);
  };

  const isConnected = (provider: WearableProvider) => connected.includes(provider);

  const renderLeagueBadges = (support: LeagueSupport) => {
    if (support === 'both') {
      return (
        <div className="flex gap-1">
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal bg-secondary/10 text-secondary border-secondary/20">Run</Badge>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal bg-primary/10 text-primary border-primary/20">Engine</Badge>
        </div>
      );
    }
    if (support === 'run') return <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal bg-secondary/10 text-secondary border-secondary/20">Run</Badge>;
    if (support === 'engine') return <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal bg-primary/10 text-primary border-primary/20">Engine</Badge>;
    return <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal bg-muted/50 text-muted-foreground border-muted">Recovery</Badge>;
  };

  const terraConnected = connected.some(p => ['garmin', 'polar', 'coros', 'fitbit', 'oura', 'samsung', 'myzone'].includes(p));
  const terraLoading = loading === 'garmin' && !terraConnected;

  return (
    <div className="space-y-3">
      <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1">
        <div className="grid grid-cols-3 gap-2">
          {/* Dedicated cards: Strava, WHOOP, Apple Health */}
          {dedicatedCards.map((card) => {
            const isActive = isConnected(card.provider);
            const isLoading = loading === card.provider && !isActive;
            const Logo = card.Logo;

            return (
              <Card 
                key={card.provider}
                className={cn(
                  "relative overflow-hidden transition-all duration-200 border-2 cursor-pointer",
                  "bg-muted/30 border-border hover:border-muted-foreground/40",
                  isActive && "ring-2 ring-primary/50"
                )}
                onClick={() => !isActive && !isLoading && handleConnect(card.provider)}
              >
                <CardContent className="flex min-h-[5.5rem] flex-col items-center justify-center gap-2 px-2 py-4 text-center">
                  {isActive && (
                    <Badge className="absolute top-1 right-1 bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0" variant="outline">
                      <Check className="h-2.5 w-2.5 mr-0.5" />Connected
                    </Badge>
                  )}
                  <div className="flex h-14 min-h-14 w-full shrink-0 items-center justify-center overflow-hidden px-1">
                    {isLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <Logo className="h-12 max-h-12 w-full max-w-[88px]" />
                    )}
                  </div>
                  {renderLeagueBadges(card.leagueSupport)}
                </CardContent>
              </Card>
            );
          })}

          {/* Single Terra card */}
          <Card 
            className={cn(
              "relative overflow-hidden transition-all duration-200 border-2 cursor-pointer col-span-3",
              "bg-muted/30 border-border hover:border-muted-foreground/40",
              terraConnected && "ring-2 ring-primary/50"
            )}
            onClick={() => !terraConnected && !terraLoading && handleConnect('garmin')}
          >
            <CardContent className="flex min-h-[6rem] flex-col items-center justify-center gap-3 px-3 py-5 text-center">
              {terraConnected && (
                <Badge className="absolute top-1 right-1 bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0" variant="outline">
                  <Check className="h-2.5 w-2.5 mr-0.5" />Connected
                </Badge>
              )}

              {terraLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-center gap-4">
                    {terraLogos.map(({ Logo, name }) => (
                      <Logo key={name} className="h-10 min-h-10 max-h-10 w-[4.5rem] shrink-0 opacity-80" />
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Link2 className="h-3 w-3" />
                    <span>Connect Wearable</span>
                  </div>
                </>
              )}

              <div className="flex gap-1">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal bg-secondary/10 text-secondary border-secondary/20">Run</Badge>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal bg-primary/10 text-primary border-primary/20">Engine</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {connected.length > 0 && (
        <p className="text-sm text-center text-muted-foreground">
          {connected.length} device{connected.length > 1 ? 's' : ''} connected
        </p>
      )}

      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        <span>Read-only access. We never post or modify your data.</span>
      </div>
    </div>
  );
};

export default OnboardingWearables;
