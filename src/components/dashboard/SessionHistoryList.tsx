import { useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, Flame, Timer, ChevronDown } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  activity_date: string;
  duration_minutes: number;
  league_type: string;
  raw_score: number;
  is_valid: boolean;
  status?: string | null;
  reject_reason?: string | null;
  status_explanation?: string | null;
}

interface SessionHistoryListProps {
  activities: Activity[];
}

const REJECT_REASON_LABELS: Record<string, string> = {
  too_short:                  'Workout under 15 minutes — not scored',
  duplicate:                  'Already synced',
  daily_cap_hit:              'Daily limit reached (max 2 per league per day)',
  hr_too_low:                 'Heart rate too low to qualify',
  hr_below_non_apple_minimum: 'Heart rate below 60% — connect Apple Watch for relaxed threshold',
  no_hr_or_speed_data:        'No heart rate or speed data found',
  no_hr_data:                 'No heart rate data found',
  no_qualifying_data:         'No qualifying data for either league',
  no_pace_data:               'No pace data found for run scoring',
  pace_too_slow:              'Pace too slow to qualify',
  no_qualifying_pace:         'Pace outside scoring range',
};

function formatActivityDate(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d");
}

function getLeagueIcon(leagueType: string) {
  if (leagueType === "engine") {
    return <Flame className="h-4 w-4 text-orange-500" />;
  }
  return <Timer className="h-4 w-4 text-blue-500" />;
}

function getStatusIcon(activity: Activity) {
  const status = activity.status;

  if (status === 'rejected' || status === 'error') {
    return <XCircle className="h-4 w-4 text-destructive" />;
  }
  if (status === 'flagged') {
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  }
  if (status === 'scored' || activity.is_valid) {
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  }
  // Fallback for old rows without status
  return activity.is_valid
    ? <CheckCircle className="h-4 w-4 text-green-500" />
    : <XCircle className="h-4 w-4 text-destructive" />;
}

function getExplanationText(activity: Activity): string | null {
  // Rejection reason takes priority
  if (activity.status === 'rejected' && activity.reject_reason) {
    return REJECT_REASON_LABELS[activity.reject_reason] ?? activity.reject_reason;
  }
  if (activity.status === 'error' && activity.reject_reason) {
    return `Error: ${activity.reject_reason}`;
  }
  if (activity.status === 'flagged') {
    return activity.status_explanation ?? 'Scored and under review';
  }
  // Fall back to status_explanation for scored activities
  return activity.status_explanation ?? null;
}

export function SessionHistoryList({ activities }: SessionHistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (activities.length === 0) {
    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Session History
        </h4>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">No sessions recorded yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Session History
      </h4>
      <div className="space-y-2">
        {activities.map((activity) => {
          const explanationText = getExplanationText(activity);
          const hasExplanation = !!explanationText;
          const isExpanded = expandedId === activity.id;

          return (
            <div key={activity.id}>
              <div
                className={cn(
                  "flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2.5",
                  hasExplanation && "cursor-pointer active:bg-muted/50 transition-colors",
                  isExpanded && "rounded-b-none"
                )}
                onClick={() => hasExplanation && setExpandedId(isExpanded ? null : activity.id)}
              >
                <div className="flex items-center gap-3">
                  {getLeagueIcon(activity.league_type)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {activity.duration_minutes} min
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {activity.league_type}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatActivityDate(activity.activity_date)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {Math.round(activity.raw_score)} pts
                  </span>
                  {getStatusIcon(activity)}
                  {hasExplanation && (
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                        isExpanded && "rotate-180"
                      )}
                    />
                  )}
                </div>
              </div>
              {isExpanded && explanationText && (
                <div className={cn(
                  "border-t border-border/50 rounded-b-lg px-4 py-2.5",
                  activity.status === 'rejected' ? "bg-destructive/5" :
                  activity.status === 'flagged' ? "bg-yellow-500/5" :
                  "bg-muted/20"
                )}>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {explanationText}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
