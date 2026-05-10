/** Decorative previews shown behind blurred PremiumGate overlays */

const GREEN_BARS = [72, 100, 45, 88, 55, 95, 38, 84, 62, 90, 42, 78] as const;

export function InsightsPreview() {
  return (
    <div className="min-h-[200px] bg-zinc-950/80 px-4 py-6">
      <div className="mb-6 flex justify-between rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2">
        <div className="h-2 w-16 rounded-full bg-emerald-500/40" />
        <div className="h-2 w-10 rounded-full bg-emerald-400/35" />
      </div>
      <div className="flex h-36 items-end justify-between gap-1.5 sm:gap-2" aria-hidden>
        {GREEN_BARS.map((h, i) => (
          <div
            key={i}
            className="min-w-[6px] flex-1 rounded-t-sm bg-gradient-to-t from-emerald-950 to-emerald-500/80 ring-1 ring-emerald-500/25 sm:min-w-[8px]"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <div className="h-2.5 w-[55%] rounded-full bg-teal-500/30" />
        <div className="h-2.5 w-[72%] rounded-full bg-teal-500/35" />
        <div className="h-2.5 w-[42%] rounded-full bg-teal-500/25" />
      </div>
    </div>
  );
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
