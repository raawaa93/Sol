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


/**
 * Formats an exchange-provided timestamp as elapsed time.
 * Timestamp age is not proof of upstream feed freshness or last-trade time.
 */
export function formatSourceTimestampAge(timestamp: string | undefined, now = Date.now()): string {
  if (!timestamp) return 'غير متاح';
  const sourceTime = Date.parse(timestamp);
  if (!Number.isFinite(sourceTime) || !Number.isFinite(now)) return 'وقت غير صالح';
  const ageMs = now - sourceTime;
  if (ageMs < -FUTURE_CLOCK_SKEW_TOLERANCE_MS) return 'وقت مستقبلي؛ تحقّق';
  const seconds = Math.floor(Math.max(0, ageMs) / 1_000);
  if (seconds < 60) return `منذ ${seconds} ث`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}
