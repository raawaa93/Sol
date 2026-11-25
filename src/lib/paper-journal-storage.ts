export const PAPER_JOURNAL_STORAGE_KEY = 'volterra-paper-trades-v1';
export const PAPER_JOURNAL_RECOVERY_KEY = 'volterra-paper-trades-recovery-v1';

export interface PaperJournalLoadResult<T> {
  entries: T[];
  rejectedCount: number;
  backupAvailable: boolean;
  persistenceBlocked: boolean;
  parseError: boolean;
}

export interface PaperJournalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Load only validated journal rows. Before dropping any invalid row from the
 * active view, preserve the exact original JSON in a separate recovery key.
 * If preservation fails (or a different earlier recovery snapshot already
 * exists), block writes to the primary key so the original bytes are not lost.
 */
export function loadPaperJournal<T>(
  storage: PaperJournalStorage,
  isValid: (value: unknown) => value is T,
): PaperJournalLoadResult<T> {
  let raw: string | null;
  try {
    raw = storage.getItem(PAPER_JOURNAL_STORAGE_KEY);
  } catch {
    return { entries: [], rejectedCount: 0, backupAvailable: false, persistenceBlocked: true, parseError: false };
  }
  if (raw === null) {
    let backupAvailable = false;
    try { backupAvailable = storage.getItem(PAPER_JOURNAL_RECOVERY_KEY) !== null; } catch { /* read-only fallback */ }
    return { entries: [], rejectedCount: 0, backupAvailable, persistenceBlocked: false, parseError: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return preserveRejectedJournal(storage, raw, 0, true);
  }
  if (!Array.isArray(parsed)) {
    return preserveRejectedJournal(storage, raw, 0, true);
  }

  const entries = parsed.filter(isValid);
  const rejectedCount = parsed.length - entries.length;
  if (rejectedCount === 0) {
    let backupAvailable = false;
    try { backupAvailable = storage.getItem(PAPER_JOURNAL_RECOVERY_KEY) !== null; } catch { /* read-only fallback */ }
    return { entries, rejectedCount: 0, backupAvailable, persistenceBlocked: false, parseError: false };
  }
  return preserveRejectedJournal(storage, raw, rejectedCount, false, entries);
}

function preserveRejectedJournal<T>(
  storage: PaperJournalStorage,
  raw: string,
  rejectedCount: number,
  parseError: boolean,
  entries: T[] = [],
): PaperJournalLoadResult<T> {
  try {
    const existing = storage.getItem(PAPER_JOURNAL_RECOVERY_KEY);
    if (existing === null) {
      storage.setItem(PAPER_JOURNAL_RECOVERY_KEY, raw);
      return { entries, rejectedCount, backupAvailable: true, persistenceBlocked: false, parseError };
    }
    if (existing === raw) {
      return { entries, rejectedCount, backupAvailable: true, persistenceBlocked: false, parseError };
    }
    // Never overwrite a previous recovery copy with a different snapshot.
    return { entries, rejectedCount, backupAvailable: true, persistenceBlocked: true, parseError };
  } catch {
    return { entries, rejectedCount, backupAvailable: false, persistenceBlocked: true, parseError };
  }
}

export function readPaperJournalRecovery(storage: PaperJournalStorage): string | null {
  try { return storage.getItem(PAPER_JOURNAL_RECOVERY_KEY); } catch { return null; }
}

export function readPaperJournalPrimary(storage: PaperJournalStorage): string | null {
  try { return storage.getItem(PAPER_JOURNAL_STORAGE_KEY); } catch { return null; }
}

export function clearPaperJournalRecovery(storage: PaperJournalStorage): boolean {
  try {
    storage.removeItem(PAPER_JOURNAL_RECOVERY_KEY);
    return true;
  } catch {
    return false;
  }
}
