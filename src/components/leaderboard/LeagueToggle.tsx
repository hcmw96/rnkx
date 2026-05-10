import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

export type LeaderboardLeagueTab = "engine" | "run" | "friends";

interface LeagueToggleProps {
  activeLeague: LeaderboardLeagueTab;
  onLeagueChange: (league: LeaderboardLeagueTab) => void;
}

export function LeagueToggle({ activeLeague, onLeagueChange }: LeagueToggleProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      <button
        type="button"
        onClick={() => {
          haptic('light');
          onLeagueChange("engine");
        }}
        className={cn(
          "flex-1 rounded-md px-2 py-2 text-xs font-medium transition-all sm:text-sm sm:px-4",
          activeLeague === "engine"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        ENGINE
      </button>
      <button
        type="button"
        onClick={() => {
          haptic('light');
          onLeagueChange("run");
        }}
        className={cn(
          "flex-1 rounded-md px-2 py-2 text-xs font-medium transition-all sm:text-sm sm:px-4",
          activeLeague === "run"
            ? "bg-secondary text-secondary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        RUN
      </button>
      <button
        type="button"
        onClick={() => {
          haptic('light');
          onLeagueChange("friends");
        }}
        className={cn(
          "flex-1 rounded-md px-2 py-2 text-xs font-medium transition-all sm:text-sm sm:px-4",
          activeLeague === "friends"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        FRIENDS
      </button>
    </div>
  );
}
