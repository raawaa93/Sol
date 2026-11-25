export const PAPER_JOURNAL_BACKUP_FORMAT = 'SOL_PAPER_JOURNAL';
export const PAPER_JOURNAL_BACKUP_VERSION = 1;
export const PAPER_JOURNAL_BACKUP_MAX_BYTES = 5 * 1024 * 1024;
export const PAPER_JOURNAL_BACKUP_MAX_ENTRIES = 10_000;

export interface PaperJournalBackup<T> {
  format: typeof PAPER_JOURNAL_BACKUP_FORMAT;
  schemaVersion: typeof PAPER_JOURNAL_BACKUP_VERSION;
  exportedAt: string;
  trades: T[];
}

export type PaperJournalBackupResult<T> =
  | { ok: true; entries: T[] }
  | { ok: false; reason: string };

function hasId(value: unknown): value is { id: string } {
  return Boolean(value && typeof value === 'object'
    && typeof (value as { id?: unknown }).id === 'string'
    && (value as { id: string }).id.trim().length > 0);
}

function hasUniqueIds<T>(entries: T[]): boolean {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!hasId(entry) || ids.has(entry.id)) return false;
    ids.add(entry.id);
  }
  return true;
}

/** Compare JSON-safe records independent of object-key insertion order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function createPaperJournalBackup<T>(
  entries: T[],
  isValid: (value: unknown) => value is T,
  exportedAt = new Date().toISOString(),
): PaperJournalBackupResult<T> & { json?: string; byteLength?: number } {
  if (!Number.isFinite(Date.parse(exportedAt))) return { ok: false, reason: 'INVALID_EXPORT_TIMESTAMP' };
  if (!Array.isArray(entries) || entries.length > PAPER_JOURNAL_BACKUP_MAX_ENTRIES
    || !entries.every(isValid) || !hasUniqueIds(entries)) {
    return { ok: false, reason: 'INVALID_OR_DUPLICATE_JOURNAL_ENTRIES' };
  }
  const backup: PaperJournalBackup<T> = {
    format: PAPER_JOURNAL_BACKUP_FORMAT,
    schemaVersion: PAPER_JOURNAL_BACKUP_VERSION,
    exportedAt,
    trades: entries,
  };
  const json = JSON.stringify(backup, null, 2);
  const byteLength = new TextEncoder().encode(json).byteLength;
  if (byteLength > PAPER_JOURNAL_BACKUP_MAX_BYTES) return { ok: false, reason: 'BACKUP_TOO_LARGE' };
  return { ok: true, entries, json, byteLength };
}

export function parsePaperJournalBackup<T>(
  raw: string,
  isValid: (value: unknown) => value is T,
): PaperJournalBackupResult<T> {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > PAPER_JOURNAL_BACKUP_MAX_BYTES) {
    return { ok: false, reason: 'BACKUP_TOO_LARGE' };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, reason: 'INVALID_JSON' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'INVALID_BACKUP_OBJECT' };
  const backup = parsed as Partial<PaperJournalBackup<unknown>>;
  if (backup.format !== PAPER_JOURNAL_BACKUP_FORMAT) return { ok: false, reason: 'UNKNOWN_BACKUP_FORMAT' };
  if (backup.schemaVersion !== PAPER_JOURNAL_BACKUP_VERSION) return { ok: false, reason: 'UNSUPPORTED_BACKUP_VERSION' };
  if (typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))) {
    return { ok: false, reason: 'INVALID_EXPORT_TIMESTAMP' };
  }
  if (!Array.isArray(backup.trades) || backup.trades.length > PAPER_JOURNAL_BACKUP_MAX_ENTRIES) {
    return { ok: false, reason: 'INVALID_OR_OVERSIZED_ENTRY_LIST' };
  }
  if (!backup.trades.every(isValid) || !hasUniqueIds(backup.trades)) {
    return { ok: false, reason: 'INVALID_OR_DUPLICATE_JOURNAL_ENTRIES' };
  }
  return { ok: true, entries: backup.trades };
}

/**
 * Merge is additive and conflict-safe: an identical ID+record is skipped,
 * while the same ID with different content rejects the entire import.
 */
export function mergePaperJournalBackup<T extends { id: string }>(
  current: T[],
  incoming: T[],
  isValid: (value: unknown) => value is T,
): PaperJournalBackupResult<T> {
  if (!Array.isArray(current) || !Array.isArray(incoming)
    || current.length > PAPER_JOURNAL_BACKUP_MAX_ENTRIES
    || incoming.length > PAPER_JOURNAL_BACKUP_MAX_ENTRIES
    || !current.every(isValid) || !incoming.every(isValid)
    || !hasUniqueIds(current) || !hasUniqueIds(incoming)) {
    return { ok: false, reason: 'INVALID_OR_OVERSIZED_JOURNAL' };
  }
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  const merged = [...current];
  for (const entry of incoming) {
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      merged.push(entry);
      continue;
    }
    if (stableJson(existing) !== stableJson(entry)) {
      return { ok: false, reason: 'JOURNAL_ID_CONFLICT' };
    }
  }
  if (merged.length > PAPER_JOURNAL_BACKUP_MAX_ENTRIES) {
    return { ok: false, reason: 'INVALID_OR_OVERSIZED_JOURNAL' };
  }
  return { ok: true, entries: merged };
}
