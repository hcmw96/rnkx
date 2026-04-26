import { Clock, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";

type Division = "Open" | "Challenger" | "Pro" | "Elite";

interface SeasonCardProps {
  seasonName: string;
  engineRank?: number | null;
  runRank?: number | null;
  enginePoints?: number;
  runPoints?: number;
  daysRemaining?: number;
  selectedLeagues?: string[];
  engineDivision?: Division;
  runDivision?: Division;
}

export function SeasonCard({
  seasonName,
  engineRank,
  runRank,
  enginePoints = 0,
  runPoints = 0,
  daysRemaining,
  selectedLeagues = [],
  engineDivision = "Open",
  runDivision = "Open",
}: SeasonCardProps) {
  const showEngine = selectedLeagues.length === 0 || selectedLeagues.includes('engine');
  const showRun = selectedLeagues.length === 0 || selectedLeagues.includes('run');
  const showBoth = showEngine && showRun;
  
  const formatRank = (rank: number | null | undefined) => {
    if (rank === null || rank === undefined) return "-";
    return `#${rank.toLocaleString()}`;
  };

  const formatPoints = (points: number) => {
    return points.toLocaleString();
  };




  return (
    <Card className="card-elevated p-4 space-y-4">
      {/* Live Season Banner */}
      <div className="flex items-center justify-center gap-2 py-2 px-3 bg-primary/10 border border-primary/20 rounded-lg">
        <Zap className="h-4 w-4 text-primary animate-pulse flex-shrink-0" />
        <span className="text-xs font-medium text-primary whitespace-nowrap">
          Season 1 is LIVE – Rankings update weekly
        </span>
      </div>

      {/* Season Header */}
      <div className="text-center">
        <h2 className="font-display text-2xl text-foreground">
          {seasonName?.includes(' - ') ? seasonName.split(' - ')[0] : seasonName}
        </h2>
        {seasonName?.includes(' - ') && (
          <p className="text-sm text-muted-foreground">
            {seasonName.split(' - ')[1]}
          </p>
        )}
      </div>

      {/* Division Badges */}
      <div className={`grid gap-4 ${showBoth ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {showEngine && (
          <div className="flex justify-center">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-primary/40 shadow-sm">
              <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
                ENGINE
              </span>
              <span className="text-xs font-bold text-foreground">
                {engineDivision}
              </span>
            </div>
          </div>
        )}
        {showRun && (
          <div className="flex justify-center">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-secondary/40 shadow-sm">
              <span className="text-[10px] font-semibold text-secondary uppercase tracking-wide">
                RUN
              </span>
              <span className="text-xs font-bold text-foreground">
                {runDivision}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* League Stats - Dynamic layout based on selection */}
      <div className={`grid gap-4 ${showBoth ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {showEngine && (
          <div className="text-center p-3 rounded-lg bg-surface border border-border">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Engine</span>
            <div className="font-display text-3xl text-primary mt-1">
              {formatRank(engineRank)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {formatPoints(enginePoints)} pts
            </div>
          </div>
        )}

        {showRun && (
          <div className="text-center p-3 rounded-lg bg-surface border border-border">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Run</span>
            <div className="font-display text-3xl text-secondary mt-1">
              {formatRank(runRank)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {formatPoints(runPoints)} pts
            </div>
          </div>
        )}
      </div>

      {/* Countdown */}
      {daysRemaining !== undefined && (
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span className="text-sm">
            {daysRemaining > 0 
              ? `Season ends in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
              : "Season ended"
            }
          </span>
        </div>
      )}
    </Card>
  );
}
