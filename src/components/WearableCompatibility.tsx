import { useState, type ReactNode } from 'react';
import { ChevronDown, Info, Trophy } from 'lucide-react';
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

/** Display order: Apple → Garmin → WHOOP */
const WEARABLE_DEVICES: WearableDevice[] = [
  {
    name: 'Apple Watch',
    sync: 'manual',
    description: 'Manual sync. Open the app and tap Sync after each workout.',
    leagues: 'both',
  },
  {
    name: 'Garmin',
    sync: 'automatic',
    description: 'Automatic. Workouts sync in the background.',
    leagues: 'both',
  },
  {
    name: 'WHOOP',
    sync: 'automatic',
    description: 'Automatic. Workouts sync in the background.',
    leagues: 'engine',
  },
];

function SyncChip({ mode }: { mode: SyncMode }) {
  const isManual = mode === 'manual';

  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        isManual
          ? 'border border-border bg-muted/50 text-muted-foreground'
          : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
      )}
    >
      {isManual ? 'Manual' : 'Automatic'}
    </span>
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

function CompatibilitySection({
  icon: Icon,
  title,
  subtitle,
  open,
  onOpenChange,
  children,
}: {
  icon: typeof Info;
  title: string;
  subtitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
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
  const [syncOpen, setSyncOpen] = useState(false);
  const [leaguesOpen, setLeaguesOpen] = useState(false);

  return (
    <div className={cn('font-sans', className)}>
      <CompatibilitySection
        icon={Info}
        title="Wearable compatibility"
        subtitle="Manual vs automatic sync"
        open={syncOpen}
        onOpenChange={setSyncOpen}
      >
        <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/10">
          {WEARABLE_DEVICES.map((device, index) => (
            <div
              key={device.name}
              className={cn('px-3 py-3', index > 0 ? 'border-t border-border/60' : undefined)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{device.name}</p>
                <SyncChip mode={device.sync} />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{device.description}</p>
            </div>
          ))}
          <p className="border-t border-border/60 px-3 py-2.5 text-xs text-muted-foreground/60">
            More devices coming soon
          </p>
        </div>
      </CompatibilitySection>

      <CompatibilitySection
        icon={Trophy}
        title="League compatibility"
        subtitle="Run and Engine scoring by device"
        open={leaguesOpen}
        onOpenChange={setLeaguesOpen}
      >
        <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/10">
          {WEARABLE_DEVICES.map((device, index) => (
            <div
              key={device.name}
              className={cn('px-3 py-3', index > 0 ? 'border-t border-border/60' : undefined)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{device.name}</p>
                <div className="flex gap-1">
                  {(device.leagues === 'run' || device.leagues === 'both') && (
                    <LeagueBadge league="run" />
                  )}
                  {(device.leagues === 'engine' || device.leagues === 'both') && (
                    <LeagueBadge league="engine" />
                  )}
                </div>
              </div>
              {device.leagues === 'engine' ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Engine League only — runs still score on heart rate.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </CompatibilitySection>
    </div>
  );
}
