import { Zap } from 'lucide-react';
import type { InsightsSummary } from '@/lib/insightsAggregates';

type CoachNotesCardProps = {
  summary: InsightsSummary;
};

export function CoachNotesCard({ summary }: CoachNotesCardProps) {
  return (
    <div className="rounded-xl border border-neon-lime/30 bg-gradient-to-br from-[hsla(72,35%,10%,0.5)] to-[hsla(0,0%,8%,1)] p-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-neon-lime" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide text-neon-lime">Coach notes</p>
      </div>
      <ul className="mt-3 space-y-2">
        {summary.insightLines.map((line) => (
          <li key={line} className="text-sm leading-relaxed text-foreground/90">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
