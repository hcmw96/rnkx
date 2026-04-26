import { cn } from '@/lib/utils';
import { Activity, Heart, CheckCircle2, AlertCircle } from 'lucide-react';
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
    description: 'Pace-based scoring. Earn points for faster runs and longer distances.',
    icon: Activity,
    bgColor: 'bg-secondary',
    textColor: 'text-secondary-foreground',
    shadowColor: 'shadow-[0_10px_40px_-10px_hsl(186_100%_50%/0.4)]',
    compatibleSupports: ['run', 'both'] as const,
  },
  {
    value: 'engine',
    name: 'Engine League',
    description: 'Heart rate-based scoring. Earn points for time in target HR zones.',
    icon: Heart,
    bgColor: 'bg-primary',
    textColor: 'text-primary-foreground',
    shadowColor: 'shadow-[0_10px_40px_-10px_hsl(72_100%_50%/0.4)]',
    compatibleSupports: ['engine', 'both'] as const,
  }
];

const LeagueSelect = ({ value, onChange, connectedWearables = [] }: LeagueSelectProps) => {
  // Get compatible devices for each league
  const getCompatibleDevices = (leagueValue: string) => {
    const league = leagues.find(l => l.value === leagueValue);
    if (!league) return [];
    
    const supports = league.compatibleSupports as readonly string[];
    return connectedWearables
      .map(provider => getWearableConfig(provider))
      .filter((config) => config && supports.includes(config.leagueSupport))
      .map((config) => config!.name);
  };

  const handleToggle = (leagueValue: string) => {
    const currentValues = value || [];
    if (currentValues.includes(leagueValue)) {
      // Remove if already selected (but must keep at least one)
      if (currentValues.length > 1) {
        onChange(currentValues.filter(v => v !== leagueValue));
      }
    } else {
      // Add to selection
      onChange([...currentValues, leagueValue]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
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
              "relative flex items-start gap-4 p-5 rounded-2xl border-2 transition-all duration-300 text-left",
              isSelected
                ? `border-transparent ${league.bgColor} shadow-xl ${league.shadowColor}`
                : "border-border bg-card hover:border-muted-foreground/50 hover:bg-muted/30"
            )}
          >
            <div className={cn(
              "flex items-center justify-center w-14 h-14 rounded-xl shrink-0",
              isSelected
                ? "bg-background/20"
                : "bg-muted"
            )}>
              <Icon className={cn(
                "w-7 h-7",
                isSelected ? league.textColor : "text-foreground"
              )} />
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className={cn(
                "font-bold text-lg mb-1",
                isSelected ? league.textColor : "text-foreground"
              )}>
                {league.name}
              </h3>
              <p className={cn(
                "text-sm leading-relaxed",
                isSelected ? `${league.textColor} opacity-80` : "text-muted-foreground"
              )}>
                {league.description}
              </p>
              
              {/* Device compatibility info */}
              {hasConnectedAny && (
                <div className={cn(
                  "mt-2 flex items-center gap-1.5 text-xs",
                  isSelected 
                    ? hasCompatibleDevice ? `${league.textColor} opacity-90` : `${league.textColor} opacity-70`
                    : hasCompatibleDevice ? "text-primary" : "text-muted-foreground"
                )}>
                  {hasCompatibleDevice ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Works with: {compatibleDevices.join(', ')}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Connect a {league.value === 'run' ? 'GPS' : 'HR'} device for this league</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {isSelected && (
              <div className="absolute top-3 right-3 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default LeagueSelect;
