/** Decorative previews shown behind blurred PremiumGate overlays */
import { InsightsPreviewChart } from '@/components/insights/DashboardInsights';

export function InsightsPreview() {
  return <InsightsPreviewChart />;
}

const MOCK_ROWS = [
  { name: 'Alex K.', initials: 'A', pts: '1,842' },
  { name: 'Jamie L.', initials: 'J', pts: '1,695' },
  { name: 'Sam R.', initials: 'S', pts: '1,521' },
  { name: 'Taylor M.', initials: 'T', pts: '1,408' },
] as const;

export function FriendsPreview() {
  return (
    <div className="space-y-2 bg-card px-3 py-4">
      {MOCK_ROWS.map((row, i) => (
        <div
          key={`${row.name}-${i}`}
          className="flex items-center gap-3 rounded-lg border border-border bg-zinc-900/80 p-3"
          aria-hidden
        >
          <span className="w-8 shrink-0 text-center font-mono text-sm text-muted-foreground">{i + 1}</span>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold text-muted-foreground">
            {row.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-4 w-28 rounded bg-muted/80" />
            <div className="mt-1.5 h-3 w-20 rounded bg-muted/50" />
          </div>
          <div className="shrink-0 text-right">
            <span className="text-sm font-semibold text-muted-foreground">{row.pts}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
