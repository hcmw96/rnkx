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
  { rank: 1, name: 'You', fill: 0.9, bar: 'lime', delta: 12 },
  { rank: 2, name: 'marcusreid', fill: 0.72, bar: 'cyan', delta: -1 },
  { rank: 3, name: 'priyapatel', fill: 0.52, bar: 'cyan', delta: 4 },
];

export function WelcomeRankStack({ className }: { className?: string }) {
  return (
    <div className={cn('flex w-full flex-col gap-3', className)} aria-hidden>
      <div className="rounded-2xl border border-neon-lime bg-black px-3.5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-neon-lime bg-black">
            <img src={rnkxSymbol} alt="" className="h-8 w-8 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.95rem] font-bold uppercase tracking-[0.06em] text-white">
              Rank up ▲
            </p>
            <p className="mt-0.5 text-[0.8125rem] leading-snug text-zinc-400">
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
            className="flex items-start gap-3 rounded-2xl bg-[#141414] px-3.5 py-3"
          >
            <span
              className={cn(
                'w-5 shrink-0 pt-px text-center text-[1.05rem] font-bold tabular-nums leading-none',
                row.rank === 1 ? 'text-neon-lime' : 'text-white',
              )}
            >
              {row.rank}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[0.95rem] font-bold leading-none text-white">{row.name}</p>
                <span
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums leading-none',
                    up ? 'text-neon-lime' : 'text-[#FF6B7A]',
                  )}
                >
                  {up ? '↑' : '↓'} {Math.abs(row.delta)}
                </span>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={cn(
                    'h-full rounded-full',
                    row.bar === 'lime' ? 'bg-neon-lime' : 'bg-electric-cyan',
                  )}
                  style={{ width: `${Math.round(row.fill * 100)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
