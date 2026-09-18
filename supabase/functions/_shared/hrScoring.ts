export const MIN_PLAUSIBLE_HR = 80;
export const MAX_PLAUSIBLE_HR = 230;

export function toWholeBpm(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n > 0 ? n : null;
}

export function plausibleHr(value: number | null | undefined): number | null {
  const n = toWholeBpm(value);
  if (n == null || n < MIN_PLAUSIBLE_HR || n > MAX_PLAUSIBLE_HR) return null;
  return n;
}

export function parseStoredMaxHr(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function ageMaxHrFromDob(dob: string | null | undefined): number {
  if (!dob) return 190;
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  if (!Number.isFinite(age) || age < 10 || age > 90) return 190;
  return 220 - age;
}

/** Highest plausible HR observed on a session (peak, else average). */
export function observedSessionHr(
  avg: number | null | undefined,
  peak: number | null | undefined,
): number | null {
  const candidates = [plausibleHr(peak), plausibleHr(avg)].filter((n): n is number => n != null);
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

export function effectiveMaxHr(
  stored: number | null | undefined,
  ageFallback: number,
  observed: number | null | undefined,
): number {
  const base = stored != null && stored > 0 ? stored : ageFallback;
  return observed != null && observed > 0 ? Math.max(base, observed) : base;
}

export function avgHrPercent(avgHr: number | null, effectiveMax: number): number | null {
  if (avgHr == null || !(effectiveMax > 0)) return null;
  return Math.min(100, Math.round((avgHr / effectiveMax) * 100));
}

export function isBeforeJoin(startMs: number, joinedAt: string | null | undefined): boolean {
  if (!joinedAt) return false;
  const joinedMs = Date.parse(joinedAt);
  return Number.isFinite(joinedMs) && Number.isFinite(startMs) && startMs < joinedMs;
}

export function isOutsideSeason(
  startMs: number,
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): boolean {
  if (!Number.isFinite(startMs)) return true;
  if (startsAt) {
    const s = Date.parse(startsAt);
    if (Number.isFinite(s) && startMs < s) return true;
  }
  if (endsAt) {
    const e = Date.parse(endsAt);
    if (Number.isFinite(e) && startMs > e) return true;
  }
  return false;
}
