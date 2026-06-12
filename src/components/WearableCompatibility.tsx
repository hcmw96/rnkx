import { cn } from '@/lib/utils';

type SyncMode = 'manual' | 'automatic';

type WearableDevice = {
  name: string;
  sync: SyncMode;
  description: string;
};

const WEARABLE_DEVICES: WearableDevice[] = [
  {
    name: 'Apple Watch',
    sync: 'manual',
    description: 'Manual sync. Open the app and tap Sync after each workout.',
  },
  {
    name: 'WHOOP',
    sync: 'automatic',
    description: 'Automatic. Workouts sync in the background.',
  },
  {
    name: 'Garmin',
    sync: 'automatic',
    description: 'Automatic. Workouts sync in the background.',
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

type WearableCompatibilityProps = {
  className?: string;
};

export function WearableCompatibility({ className }: WearableCompatibilityProps) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border/70 bg-muted/10 font-sans', className)}>
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
  );
}
