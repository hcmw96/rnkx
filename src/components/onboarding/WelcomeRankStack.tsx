import rnkxSymbol from '@/assets/rnkx-symbol.png';
import { cn } from '@/lib/utils';

type RankRow = {
  rank: number;
  name: string;
  fill: number;
  bar: 'lime' | 'cyan';
  delta: number;
};

const ROWS: RankRow[] = [
  { rank: 1, name: 'You', fill: 0.78, bar: 'lime', delta: 12 },
  { rank: 2, name: 'marcusreid', fill: 0.58, bar: 'cyan', delta: -1 },
  { rank: 3, name: 'priyapatel', fill: 0.42, bar: 'cyan', delta: 4 },
];

export function WelcomeRankStack({ className }: { className?: string }) {
  return (
    <div className={cn('flex w-full flex-col gap-2.5', className)} aria-hidden>
      <div className="rounded-2xl border border-neon-lime/70 bg-zinc-950 px-3.5 py-3 shadow-[0_0_28px_hsl(72_100%_50%/0.28)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black">
            <img src={rnkxSymbol} alt="" className="h-8 w-8 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.95rem] font-bold uppercase tracking-wide text-white">
              Rank up <span className="text-neon-lime">▲</span>
            </p>
            <p className="mt-0.5 text-[0.8rem] leading-snug text-zinc-400">
              You climbed 12 places this week.
            </p>
          </div>
        </div>
      </div>

      {ROWS.map((row) => {
        const up = row.delta > 0;
        return (
          <div
            key={row.rank}
            className="flex items-center gap-3 rounded-2xl bg-zinc-950/90 px-3.5 py-3 ring-1 ring-white/[0.06]"
          >
            <span
              className={cn(
                'w-5 shrink-0 text-center text-base font-bold tabular-nums',
                row.rank === 1 ? 'text-neon-lime' : 'text-white',
              )}
            >
              {row.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.95rem] font-semibold text-white">{row.name}</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={cn(
                    'h-full rounded-full',
                    row.bar === 'lime' ? 'bg-neon-lime' : 'bg-electric-cyan',
                  )}
                  style={{ width: `${Math.round(row.fill * 100)}%` }}
                />
              </div>
            </div>
            <span
              className={cn(
                'shrink-0 text-sm font-semibold tabular-nums',
                up ? 'text-neon-lime' : 'text-rose-400',
              )}
            >
              {up ? '↑' : '↓'} {Math.abs(row.delta)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
