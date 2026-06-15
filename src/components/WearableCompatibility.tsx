import { useState, type ReactNode } from 'react';
import { ChevronDown, Info, RefreshCw, Trophy, Zap } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

type SyncMode = 'manual' | 'automatic';
type LeagueSupport = 'engine' | 'run' | 'both';

type WearableDevice = {
  name: string;
  sync: SyncMode;
  description: string;
  leagues: LeagueSupport;
};

const WEARABLE_DEVICES: WearableDevice[] = [
  {
    name: 'Apple Watch',
    sync: 'manual',
    description: 'Open the app and tap Sync after each workout.',
    leagues: 'both',
  },
  {
    name: 'WHOOP',
    sync: 'automatic',
    description: 'Workouts sync in the background.',
    leagues: 'engine',
  },
  {
    name: 'Garmin',
    sync: 'automatic',
    description: 'Workouts sync in the background.',
    leagues: 'both',
  },
];

const RUN_LEAGUE_DEVICES = WEARABLE_DEVICES.filter(
  (d) => d.leagues === 'run' || d.leagues === 'both',
).map((d) => d.name);

const ENGINE_LEAGUE_DEVICES = WEARABLE_DEVICES.filter(
  (d) => d.leagues === 'engine' || d.leagues === 'both',
).map((d) => d.name);

function DeviceList({ devices }: { devices: WearableDevice[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/10">
      {devices.map((device, index) => (
        <div
          key={device.name}
          className={cn('px-3 py-3', index > 0 ? 'border-t border-border/60' : undefined)}
        >
          <p className="text-sm font-medium text-foreground">{device.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{device.description}</p>
        </div>
      ))}
    </div>
  );
}

function LeagueBadge({ league }: { league: 'run' | 'engine' }) {
  const isRun = league === 'run';
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        isRun
          ? 'border-electric-cyan/30 bg-electric-cyan/10 text-electric-cyan'
          : 'border-neon-lime/30 bg-neon-lime/10 text-neon-lime',
      )}
    >
      {isRun ? 'Run' : 'Engine'}
    </span>
  );
}

function LeagueSupportList() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/10">
      {WEARABLE_DEVICES.map((device, index) => (
        <div
          key={device.name}
          className={cn('px-3 py-3', index > 0 ? 'border-t border-border/60' : undefined)}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{device.name}</p>
            <div className="flex flex-wrap gap-1">
              {(device.leagues === 'run' || device.leagues === 'both') && <LeagueBadge league="run" />}
              {(device.leagues === 'engine' || device.leagues === 'both') && (
                <LeagueBadge league="engine" />
              )}
            </div>
          </div>
          {device.leagues === 'engine' ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Engine League only. Runs still score on heart rate in Engine League.
            </p>
          ) : null}
        </div>
      ))}
      <div className="border-t border-border/60 px-3 py-3 space-y-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Run League
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{RUN_LEAGUE_DEVICES.join(', ')}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Engine League
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{ENGINE_LEAGUE_DEVICES.join(', ')}</p>
        </div>
      </div>
    </div>
  );
}

type CompatibilitySectionProps = {
  icon: typeof Info;
  title: string;
  subtitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

function CompatibilitySection({
  icon: Icon,
  title,
  subtitle,
  open,
  onOpenChange,
  children,
}: CompatibilitySectionProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/30 active:bg-muted/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

type WearableCompatibilityProps = {
  className?: string;
};

export function WearableCompatibility({ className }: WearableCompatibilityProps) {
  const [automaticOpen, setAutomaticOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [leaguesOpen, setLeaguesOpen] = useState(false);

  const automaticDevices = WEARABLE_DEVICES.filter((d) => d.sync === 'automatic');
  const manualDevices = WEARABLE_DEVICES.filter((d) => d.sync === 'manual');

  return (
    <div className={cn('font-sans', className)}>
      <CompatibilitySection
        icon={Zap}
        title="Automatic sync"
        subtitle={`${automaticDevices.map((d) => d.name).join(', ')}`}
        open={automaticOpen}
        onOpenChange={setAutomaticOpen}
      >
        <DeviceList devices={automaticDevices} />
      </CompatibilitySection>

      <CompatibilitySection
        icon={RefreshCw}
        title="Manual sync"
        subtitle={`${manualDevices.map((d) => d.name).join(', ')}`}
        open={manualOpen}
        onOpenChange={setManualOpen}
      >
        <DeviceList devices={manualDevices} />
      </CompatibilitySection>

      <CompatibilitySection
        icon={Trophy}
        title="League compatibility"
        subtitle="Which devices score in Run vs Engine"
        open={leaguesOpen}
        onOpenChange={setLeaguesOpen}
      >
        <LeagueSupportList />
      </CompatibilitySection>

      <p className="px-4 py-2 text-xs text-muted-foreground/60">More devices coming soon</p>
    </div>
  );
}
