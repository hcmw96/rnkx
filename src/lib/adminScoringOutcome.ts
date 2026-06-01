import { activitySessionScore } from '@/lib/activitySessionScore';

export type ScoringOutcome = {
  counted: boolean;
  label: string;
  detail: string | null;
};

const REJECT_LABELS: Record<string, string> = {
  duration_too_short: 'Under 15 minutes',
  no_qualifying_score: 'No qualifying score',
  implausible_pace_hr_combo: 'Fast pace with low heart rate',
  duplicate: 'Duplicate workout',
};

function humanizeRejectReason(code: string | null | undefined): string {
  if (!code) return 'Not counted';
  return REJECT_LABELS[code] ?? code.replace(/_/g, ' ');
}

/** Mirrors Apple `process_activity` engine bands for admin diagnostics. */
export function recomputeWorkoutEngineScore(
  durationMin: number,
  avgHr: number | null,
  effectiveMaxHr: number,
  avgPaceSecPerKm: number | null,
): number {
  if (durationMin < 15 || avgHr == null || effectiveMaxHr <= 0) return 0;
  const duration = Math.min(durationMin, 120);
  const hrPct = (avgHr / effectiveMaxHr) * 100;
  if (avgPaceSecPerKm != null && avgPaceSecPerKm < 240 && hrPct < 60) return 0;

  const raw =
    hrPct >= 90
      ? duration * 4.8
      : hrPct >= 85
        ? duration * 4.2
        : hrPct >= 80
          ? duration * 3.7
          : hrPct >= 75
            ? duration * 2.8
            : hrPct >= 70
              ? duration * 2.0
              : hrPct >= 60
                ? duration * 1.4
                : hrPct >= 45
                  ? duration * 0.8
                  : 0;
  return Math.round(raw * 10) / 10;
}

const RUN_TYPES = new Set(['running', 'run', 'outdoor_run', 'indoor_run', 'trail_run', 'treadmill']);

/** Mirrors Apple `process_activity` run bands for admin diagnostics. */
export function recomputeWorkoutRunScore(
  durationMin: number,
  activityType: string | null,
  paceSecPerKm: number | null,
): number {
  if (durationMin < 15 || paceSecPerKm == null || paceSecPerKm <= 0) return 0;
  const type = (activityType ?? '').toLowerCase();
  if (!RUN_TYPES.has(type)) return 0;

  const duration = Math.min(durationMin, 120);
  const p = paceSecPerKm;
  const raw =
    p < 209
      ? duration * 5.6
      : p < 240
        ? duration * 5.2
        : p < 270
          ? duration * 4.7
          : p < 300
            ? duration * 4.1
            : p < 330
              ? duration * 3.5
              : p < 360
                ? duration * 3.0
                : p < 390
                  ? duration * 2.6
                  : p < 420
                    ? duration * 2.2
                    : p < 450
                      ? duration * 1.7
                      : p < 480
                        ? duration * 1.2
                        : p < 540
                          ? duration * 0.7
                          : 0;
  return Math.round(raw * 10) / 10;
}

export function workoutScoringOutcome(
  tab: 'engine' | 'run',
  row: {
    status: string | null;
    reject_reason: string | null;
    duration_min: number | string | null;
    avg_hr: number | string | null;
    avg_pace_per_km: number | string | null;
    activity_type: string | null;
    engine_score: number | string | null;
    run_score: number | string | null;
  },
  effectiveMaxHr: number,
): ScoringOutcome {
  const status = (row.status ?? 'pending').toLowerCase();
  const applied = tab === 'engine' ? Number(row.engine_score ?? 0) : Number(row.run_score ?? 0);
  const duration = Number(row.duration_min ?? 0);
  const avgHr = row.avg_hr != null ? Number(row.avg_hr) : null;
  const pace = row.avg_pace_per_km != null ? Number(row.avg_pace_per_km) : null;

  if (status === 'rejected') {
    return {
      counted: false,
      label: 'No',
      detail: humanizeRejectReason(row.reject_reason),
    };
  }

  if (applied > 0) {
    return { counted: true, label: 'Yes', detail: null };
  }

  const theoretical =
    tab === 'engine'
      ? recomputeWorkoutEngineScore(duration, avgHr, effectiveMaxHr, pace)
      : recomputeWorkoutRunScore(duration, row.activity_type, pace);

  if (theoretical > 0) {
    return {
      counted: false,
      label: 'No',
      detail: 'Daily cap (max 2 scored per day)',
    };
  }

  if (tab === 'run' && pace != null && !RUN_TYPES.has((row.activity_type ?? '').toLowerCase())) {
    return {
      counted: false,
      label: 'No',
      detail: 'Not a run activity type',
    };
  }

  return {
    counted: false,
    label: 'No',
    detail: humanizeRejectReason(row.reject_reason) || 'Below scoring threshold',
  };
}

export function activityScoringOutcome(
  tab: 'engine' | 'run',
  row: {
    status: string | null;
    league_type: string | null;
    duration_minutes: number | string | null;
    avg_hr_percent: number | string | null;
    avg_pace_seconds: number | string | null;
  },
): ScoringOutcome {
  const status = (row.status ?? 'scored').toLowerCase();
  const league = (row.league_type ?? '').toLowerCase();
  const duration = Number(row.duration_minutes ?? 0);
  const hrPercent = row.avg_hr_percent != null ? Number(row.avg_hr_percent) : null;
  const pace = row.avg_pace_seconds != null ? Number(row.avg_pace_seconds) : null;
  const theoretical = activitySessionScore(league || tab, duration, hrPercent, pace);
  const leagueMatches = tab === 'engine' ? league !== 'run' : league === 'run';

  if (status === 'rejected') {
    return { counted: false, label: 'No', detail: 'Rejected' };
  }

  if (!leagueMatches) {
    return {
      counted: false,
      label: 'No',
      detail: tab === 'engine' ? 'Run league activity' : 'Engine league activity',
    };
  }

  if (theoretical > 0) {
    return { counted: true, label: 'Yes', detail: null };
  }

  return {
    counted: false,
    label: 'No',
    detail: duration < 15 ? 'Under 15 minutes' : 'Below scoring threshold',
  };
}
