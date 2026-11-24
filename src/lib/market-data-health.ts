export const DEFAULT_SNAPSHOT_STALE_AFTER_MS = 60_000;
const FUTURE_CLOCK_SKEW_TOLERANCE_MS = 5_000;

export type SnapshotFreshness = 'fresh' | 'stale' | 'future' | 'unknown';

/**
 * Classifies the age of a received market snapshot. This is a local receipt-age
 * check, not proof that the upstream source itself published fresh values.
 */
export function assessSnapshotFreshness(
  receivedAt: number | undefined,
  now = Date.now(),
  staleAfterMs = DEFAULT_SNAPSHOT_STALE_AFTER_MS,
): SnapshotFreshness {
  if (receivedAt === undefined || !Number.isFinite(receivedAt)
    || !Number.isFinite(now) || !Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
    return 'unknown';
  }

  const ageMs = now - receivedAt;
  if (ageMs < -FUTURE_CLOCK_SKEW_TOLERANCE_MS) return 'future';
  if (ageMs < 0) return 'fresh';
  return ageMs > staleAfterMs ? 'stale' : 'fresh';
}
