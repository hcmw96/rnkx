import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MomentumBlockProps {
  weeklyChange: number;
  placesToPromotion?: number | null;
  placesToRelegation?: number | null;
  category: "engine" | "run";
  division?: string;
}

export function MomentumBlock({
  weeklyChange,
  placesToPromotion,
  placesToRelegation,
  category,
  division = "Open",
}: MomentumBlockProps) {
  const isPositive = weeklyChange > 0;
  const isNegative = weeklyChange < 0;

  const TrendIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  
  // Determine zone based on proximity to thresholds
  const isNearPromotion = placesToPromotion !== null && placesToPromotion !== undefined && placesToPromotion <= 5;
  const isNearRelegation = placesToRelegation !== null && placesToRelegation !== undefined && placesToRelegation <= 5;

  // Zone-based text color
  const zoneColor = isNearPromotion
    ? (category === "engine" ? "text-primary" : "text-secondary")
    : isNearRelegation
    ? "text-muted-foreground"
    : "text-foreground";

  // Updated wording as per feedback
  const changeText = isPositive
    ? `Climbed ${weeklyChange} places`
    : isNegative
    ? `Dropped ${Math.abs(weeklyChange)} places`
    : "Holding position";

  const hasThresholds = placesToPromotion !== null || placesToRelegation !== null;
  const progressValue = hasThresholds && placesToPromotion !== null && placesToRelegation !== null
    ? Math.round((placesToRelegation / (placesToPromotion + placesToRelegation)) * 100)
    : null;

  return (
    <Card className="card-elevated p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base text-foreground uppercase">Momentum</h3>
          <span className="text-xs text-muted-foreground">{division} Division</span>
        </div>
        <span
          className={cn(
            "text-xs uppercase tracking-wider px-2 py-1 rounded",
            category === "engine" ? "bg-primary/20 text-primary" : "bg-secondary/20 text-secondary"
          )}
        >
          {category}
        </span>
      </div>

      {/* Weekly Movement */}
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-1.5 rounded-full",
          isNearPromotion
            ? category === "engine" ? "bg-primary/20" : "bg-secondary/20"
            : "bg-muted"
        )}>
          <TrendIcon className={cn("h-4 w-4", zoneColor)} />
        </div>
        <span className={cn("text-base font-medium", zoneColor)}>{changeText}</span>
      </div>

      {/* Progress Bar - only show when we have real thresholds */}
      {progressValue !== null && (
        <div className="relative h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className={cn(
              "absolute left-0 top-0 h-full rounded-full transition-all",
              isNearPromotion
                ? category === "engine" ? "bg-primary" : "bg-secondary"
                : isNearRelegation
                ? "bg-foreground"
                : "bg-white"
            )}
            style={{ width: `${progressValue}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-foreground rounded-full border-2 border-background"
            style={{ left: `${progressValue}%`, transform: "translate(-50%, -50%)" }}
          />
        </div>
      )}

      {/* Promotion/Relegation Info */}
      <div className="flex justify-between text-sm">
        {division === "Open" ? (
          <div className="text-muted-foreground text-left">
            <div className="font-semibold">Entry division</div>
            <div>no relegation</div>
          </div>
        ) : placesToRelegation !== null && placesToRelegation !== undefined ? (
          <div className="text-foreground text-left">
            <div className="font-semibold">{placesToRelegation} places</div>
            <div>from relegation</div>
          </div>
        ) : null}
        {placesToPromotion !== null && placesToPromotion !== undefined && (
          <div className={cn(
            "ml-auto text-right",
            category === "engine" ? "text-primary" : "text-secondary"
          )}>
            <div className="font-semibold">{placesToPromotion} places</div>
            <div>from promotion</div>
          </div>
        )}
      </div>
    </Card>
  );
}
