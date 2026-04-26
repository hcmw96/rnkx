import { motion } from "framer-motion";

interface ContributionBreakdownProps {
  enginePoints: number;
  runPoints: number;
}

export function ContributionBreakdown({
  enginePoints,
  runPoints,
}: ContributionBreakdownProps) {
  const total = enginePoints + runPoints;

  if (total === 0) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Points Breakdown
        </h4>
        <div className="h-6 bg-muted/50 rounded-full flex items-center justify-center">
          <span className="text-xs text-muted-foreground">No points yet</span>
        </div>
      </div>
    );
  }

  const enginePercent = Math.round((enginePoints / total) * 100);
  const runPercent = 100 - enginePercent;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Points Breakdown
      </h4>

      {/* Stacked bar */}
      <div className="h-6 bg-muted rounded-full overflow-hidden flex">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${enginePercent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="bg-primary h-full flex items-center justify-center min-w-0"
        >
          {enginePercent > 15 && (
            <span className="text-xs font-medium text-primary-foreground truncate px-2">
              Engine
            </span>
          )}
        </motion.div>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${runPercent}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="bg-secondary h-full flex items-center justify-center min-w-0"
        >
          {runPercent > 15 && (
            <span className="text-xs font-medium text-secondary-foreground truncate px-2">
              Run
            </span>
          )}
        </motion.div>
      </div>

      {/* Legend */}
      <div className="flex justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
          <span className="text-foreground">
            {enginePoints.toLocaleString()} pts
          </span>
          <span className="text-muted-foreground">({enginePercent}%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-secondary" />
          <span className="text-foreground">
            {runPoints.toLocaleString()} pts
          </span>
          <span className="text-muted-foreground">({runPercent}%)</span>
        </div>
      </div>
    </div>
  );
}
