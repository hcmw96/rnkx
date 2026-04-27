/** Mirrors `calculate_activity_score` in scoring_trigger.sql for display-only totals. */
export function activitySessionScore(
  leagueType: string,
  durationMinutes: number,
  avgHrPercent: number | null,
  avgPaceSeconds: number | null,
): number {
  const duration = Math.min(durationMinutes, 120);
  if (leagueType === 'engine' && avgHrPercent != null) {
    const v =
      avgHrPercent >= 90
        ? duration * 4.8
        : avgHrPercent >= 80
          ? duration * 3.2
          : avgHrPercent >= 70
            ? duration * 2.0
            : avgHrPercent >= 60
              ? duration * 1.4
              : avgHrPercent >= 45
                ? duration * 0.8
                : 0;
    return Math.round(v * 10) / 10;
  }
  if (leagueType === 'run' && avgPaceSeconds != null && avgPaceSeconds > 0) {
    const p = avgPaceSeconds;
    const v =
      p < 210
        ? duration * 5.6
        : p < 240
          ? duration * 4.8
          : p < 270
            ? duration * 4.0
            : p < 300
              ? duration * 3.4
              : p < 330
                ? duration * 2.8
                : p < 360
                  ? duration * 2.3
                  : p < 420
                    ? duration * 1.9
                    : p < 480
                      ? duration * 1.5
                      : p < 540
                        ? duration * 1.1
                        : p <= 720
                          ? duration * 0.4
                          : 0;
    return Math.round(v * 10) / 10;
  }
  return 0;
}
