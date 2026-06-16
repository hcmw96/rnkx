import { cn } from '@/lib/utils';
import { Activity, Heart, Check, CheckCircle2, AlertCircle } from 'lucide-react';
import { WearableProvider, getWearableConfig } from './OnboardingWearables';

interface LeagueSelectProps {
  value: string[];
  onChange: (leagues: string[]) => void;
  connectedWearables?: WearableProvider[];
}

const leagues = [
  {
    value: 'run',
    name: 'Run League',
    tagline: '🏃 Pace-based competition',
    icon: Activity,
    selectedBorder: 'border-electric-cyan',
    selectedBg: 'bg-electric-cyan/[0.06]',
    iconSelected: 'bg-electric-cyan/10 text-electric-cyan',
    checkColor: 'text-electric-cyan',
    compatibleSupports: ['run', 'both'] as const,
  },
  {
    value: 'engine',
    name: 'Engine League',
    tagline: '❤️ Heart-rate competition',
    icon: Heart,
    selectedBorder: 'border-neon-lime',
    selectedBg: 'bg-neon-lime/[0.06]',
    iconSelected: 'bg-neon-lime/10 text-neon-lime',
    checkColor: 'text-neon-lime',
    compatibleSupports: ['engine', 'both'] as const,
  },
];

const LeagueSelect = ({ value, onChange, connectedWearables = [] }: LeagueSelectProps) => {
  const getCompatibleDevices = (leagueValue: string) => {
    const league = leagues.find((l) => l.value === leagueValue);
    if (!league) return [];

    const supports = league.compatibleSupports as readonly string[];
    return connectedWearables
      .map((provider) => getWearableConfig(provider))
      .filter((config) => config && supports.includes(config.leagueSupport))
      .map((config) => config!.name);
  };

  const handleToggle = (leagueValue: string) => {
    const currentValues = value || [];
    if (currentValues.includes(leagueValue)) {
      if (currentValues.length > 1) {
        onChange(currentValues.filter((v) => v !== leagueValue));
      }
    } else {
      onChange([...currentValues, leagueValue]);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {leagues.map((league) => {
        const Icon = league.icon;
        const isSelected = value.includes(league.value);
        const compatibleDevices = getCompatibleDevices(league.value);
        const hasCompatibleDevice = compatibleDevices.length > 0;
        const hasConnectedAny = connectedWearables.length > 0;

        return (
          <button
            key={league.value}
            type="button"
            onClick={() => handleToggle(league.value)}
            className={cn(
              'relative flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all duration-200',
              isSelected
                ? cn(league.selectedBorder, league.selectedBg)
                : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/20',
            )}
          >
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
                isSelected ? league.iconSelected : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon className="h-6 w-6" aria-hidden />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="mb-0.5 text-base font-semibold text-foreground">{league.name}</h3>
              <p className="text-sm text-muted-foreground">{league.tagline}</p>

              {hasConnectedAny ? (
                <div
                  className={cn(
                    'mt-2 flex items-center gap-1.5 text-xs',
                    hasCompatibleDevice ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {hasCompatibleDevice ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      <span>Works with: {compatibleDevices.join(', ')}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                      <span>
                        Connect a {league.value === 'run' ? 'GPS' : 'HR'} device for this league
                      </span>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {isSelected ? (
              <div
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-background',
                  league.selectedBorder,
                )}
              >
                <Check className={cn('h-3.5 w-3.5', league.checkColor)} strokeWidth={3} aria-hidden />
              </div>
            ) : (
              <div
                className="h-6 w-6 shrink-0 rounded-full border-2 border-border/80"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default LeagueSelect;
