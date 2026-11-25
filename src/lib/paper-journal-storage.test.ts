import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAPER_JOURNAL_RECOVERY_KEY,
  PAPER_JOURNAL_STORAGE_KEY,
  loadPaperJournal,
  clearPaperJournalRecovery,
  readPaperJournalRecovery,
  readPaperJournalPrimary,
  clearPaperJournalRecovery,
} from './paper-journal-storage.ts';

class MemoryStorage {
  values = new Map<string, string>();
  failSet = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failSet) throw new Error('quota exceeded');
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

const isValid = (value: unknown): value is { id: string } =>
  Boolean(value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string');

test('invalid rows are quarantined byte-for-byte before the caller persists filtered entries', () => {
  const storage = new MemoryStorage();
  const raw = JSON.stringify([{ id: 'good' }, { id: 7 }, { unexpected: true }]);
  storage.setItem(PAPER_JOURNAL_STORAGE_KEY, raw);
  const result = loadPaperJournal(storage, isValid);
  assert.deepEqual(result.entries, [{ id: 'good' }]);
  assert.equal(result.rejectedCount, 2);
  assert.equal(result.backupAvailable, true);
  assert.equal(result.persistenceBlocked, false);
  assert.equal(readPaperJournalRecovery(storage), raw);
});

test('malformed JSON is preserved and primary writes are allowed only after backup succeeds', () => {
  const storage = new MemoryStorage();
  const raw = '{"incomplete":';
  storage.setItem(PAPER_JOURNAL_STORAGE_KEY, raw);
  const result = loadPaperJournal(storage, isValid);
  assert.deepEqual(result.entries, []);
  assert.equal(result.parseError, true);
  assert.equal(result.backupAvailable, true);
  assert.equal(result.persistenceBlocked, false);
  assert.equal(readPaperJournalRecovery(storage), raw);
});

test('storage quota failure blocks primary writes rather than discarding rejected rows', () => {
  const storage = new MemoryStorage();
  const raw = JSON.stringify([{ id: 7 }]);
  storage.setItem(PAPER_JOURNAL_STORAGE_KEY, raw);
  storage.failSet = true;
  const result = loadPaperJournal(storage, isValid);
  assert.equal(result.persistenceBlocked, true);
  assert.equal(result.backupAvailable, false);
  assert.equal(storage.getItem(PAPER_JOURNAL_STORAGE_KEY), raw);
});

test('a different existing recovery snapshot is never overwritten and blocks primary writes', () => {
  const storage = new MemoryStorage();
  const raw = JSON.stringify([{ id: 7 }]);
  const oldRecovery = JSON.stringify([{ id: 'previous-snapshot' }]);
  storage.setItem(PAPER_JOURNAL_STORAGE_KEY, raw);
  storage.setItem(PAPER_JOURNAL_RECOVERY_KEY, oldRecovery);
  const result = loadPaperJournal(storage, isValid);
  assert.equal(result.persistenceBlocked, true);
  assert.equal(result.backupAvailable, true);
  assert.equal(readPaperJournalRecovery(storage), oldRecovery);
});

test('raw primary snapshot remains exportable when recovery preservation fails', () => {
  const storage = new MemoryStorage();
  const raw = '{"legacy":"preserve exactly"}';
  storage.setItem(PAPER_JOURNAL_STORAGE_KEY, raw);
  storage.failSet = true;
  const result = loadPaperJournal(storage, isValid);
  assert.equal(result.persistenceBlocked, true);
  assert.equal(readPaperJournalPrimary(storage), raw);
  assert.equal(readPaperJournalRecovery(storage), null);
});

test('confirmed recovery acknowledgement removes only the recovery key', () => {
  const storage = new MemoryStorage();
  storage.setItem(PAPER_JOURNAL_STORAGE_KEY, '[{"id":"kept"}]');
  storage.setItem(PAPER_JOURNAL_RECOVERY_KEY, '{"raw":"previous"}');
  assert.equal(clearPaperJournalRecovery(storage), true);
  assert.equal(storage.getItem(PAPER_JOURNAL_STORAGE_KEY), '[{"id":"kept"}]');
  assert.equal(storage.getItem(PAPER_JOURNAL_RECOVERY_KEY), null);
});

test('valid journal loads preserve an existing recovery snapshot without blocking normal writes', () => {
  const storage = new MemoryStorage();
  const recovery = 'older raw journal';
  storage.setItem(PAPER_JOURNAL_STORAGE_KEY, JSON.stringify([{ id: 'good' }]));
  storage.setItem(PAPER_JOURNAL_RECOVERY_KEY, recovery);
  const result = loadPaperJournal(storage, isValid);
  assert.deepEqual(result.entries, [{ id: 'good' }]);
  assert.equal(result.backupAvailable, true);
  assert.equal(result.persistenceBlocked, false);
});
