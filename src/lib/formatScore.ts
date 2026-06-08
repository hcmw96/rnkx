/** Format a score / points value for UI — rounded up to the nearest whole number. */
export function formatScore(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Math.ceil(n).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}

/** formatScore with a pts suffix. */
export function formatScorePts(value: number | string | null | undefined): string {
  return `${formatScore(value)} pts`;
}
