import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

interface LeagueToggleProps {
  activeLeague: "engine" | "run";
  onLeagueChange: (league: "engine" | "run") => void;
}

export function LeagueToggle({ activeLeague, onLeagueChange }: LeagueToggleProps) {
  return (
    <div className="flex bg-muted rounded-lg p-1">
      <button
        onClick={() => { haptic('light'); onLeagueChange("engine"); }}
        className={cn(
          "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all",
          activeLeague === "engine"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        ENGINE
      </button>
      <button
        onClick={() => { haptic('light'); onLeagueChange("run"); }}
        className={cn(
          "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all",
          activeLeague === "run"
            ? "bg-secondary text-secondary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        RUN
      </button>
    </div>
  );
}
