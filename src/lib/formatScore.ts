/** Format a score / points value for UI — always one decimal place. */
export function formatScore(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.0';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** formatScore with a pts suffix. */
export function formatScorePts(value: number | string | null | undefined): string {
  return `${formatScore(value)} pts`;
}
