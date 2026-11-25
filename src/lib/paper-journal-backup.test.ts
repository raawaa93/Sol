import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAPER_JOURNAL_BACKUP_FORMAT,
  PAPER_JOURNAL_BACKUP_MAX_BYTES,
  createPaperJournalBackup,
  mergePaperJournalBackup,
  parsePaperJournalBackup,
} from './paper-journal-backup.ts';

type Row = { id: string; createdAt: string; status: 'PAPER'; amount: number };
const valid = (value: unknown): value is Row => Boolean(value && typeof value === 'object'
  && typeof (value as Row).id === 'string'
  && typeof (value as Row).createdAt === 'string'
  && (value as Row).status === 'PAPER'
  && typeof (value as Row).amount === 'number'
  && Number.isFinite((value as Row).amount));

const first: Row = { id: 'trade-1', createdAt: '2026-11-25T08:00:00Z', status: 'PAPER', amount: 12.5 };
const second: Row = { id: 'trade-2', createdAt: '2026-11-25T08:10:00Z', status: 'PAPER', amount: 7.5 };

test('versioned JSON export round-trips valid PAPER entries', () => {
  const exported = createPaperJournalBackup([first, second], valid, '2026-11-25T09:00:00Z');
  assert.equal(exported.ok, true);
  if (!exported.ok || !exported.json) return;
  const parsed = JSON.parse(exported.json);
  assert.equal(parsed.format, PAPER_JOURNAL_BACKUP_FORMAT);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.exportedAt, '2026-11-25T09:00:00Z');
  assert.equal(exported.byteLength, new TextEncoder().encode(exported.json).byteLength);
  const restored = parsePaperJournalBackup(exported.json, valid);
  assert.deepEqual(restored, { ok: true, entries: [first, second] });
});

test('import rejects malformed JSON, unknown format and unsupported schema versions', () => {
  assert.deepEqual(parsePaperJournalBackup('{bad json', valid), { ok: false, reason: 'INVALID_JSON' });
  const wrongFormat = JSON.stringify({ format: 'OTHER', schemaVersion: 1, exportedAt: '2026-11-25T09:00:00Z', trades: [] });
  assert.deepEqual(parsePaperJournalBackup(wrongFormat, valid), { ok: false, reason: 'UNKNOWN_BACKUP_FORMAT' });
  const wrongVersion = JSON.stringify({ format: PAPER_JOURNAL_BACKUP_FORMAT, schemaVersion: 2, exportedAt: '2026-11-25T09:00:00Z', trades: [] });
  assert.deepEqual(parsePaperJournalBackup(wrongVersion, valid), { ok: false, reason: 'UNSUPPORTED_BACKUP_VERSION' });
});

test('import rejects invalid records and duplicate IDs without partially restoring', () => {
  const invalid = JSON.stringify({ format: PAPER_JOURNAL_BACKUP_FORMAT, schemaVersion: 1, exportedAt: '2026-11-25T09:00:00Z', trades: [first, { ...second, amount: Number.NaN }] });
  assert.deepEqual(parsePaperJournalBackup(invalid, valid), { ok: false, reason: 'INVALID_OR_DUPLICATE_JOURNAL_ENTRIES' });
  const duplicate = JSON.stringify({ format: PAPER_JOURNAL_BACKUP_FORMAT, schemaVersion: 1, exportedAt: '2026-11-25T09:00:00Z', trades: [first, first] });
  assert.deepEqual(parsePaperJournalBackup(duplicate, valid), { ok: false, reason: 'INVALID_OR_DUPLICATE_JOURNAL_ENTRIES' });
});

test('merge appends new IDs, skips identical entries and leaves existing entries unchanged', () => {
  const result = mergePaperJournalBackup([first], [first, second], valid);
  assert.deepEqual(result, { ok: true, entries: [first, second] });
});

test('merge rejects same-ID different-content conflicts instead of overwriting', () => {
  const changed = { ...first, amount: 99 };
  const result = mergePaperJournalBackup([first], [changed, second], valid);
  assert.deepEqual(result, { ok: false, reason: 'JOURNAL_ID_CONFLICT' });
});

test('export and import reject backups over the 5 MiB size limit', () => {
  const tooLarge = ' '.repeat(PAPER_JOURNAL_BACKUP_MAX_BYTES + 1);
  assert.deepEqual(parsePaperJournalBackup(tooLarge, valid), { ok: false, reason: 'BACKUP_TOO_LARGE' });
  const largeRows = Array.from({ length: 10_000 }, (_, i) => ({ ...first, id: `trade-${i}`, note: 'x'.repeat(600) }));
  const exported = createPaperJournalBackup(largeRows, (value): value is typeof largeRows[number] =>
    Boolean(value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'), '2026-11-25T09:00:00Z');
  assert.equal(exported.ok, false);
  if (!exported.ok) assert.equal(exported.reason, 'BACKUP_TOO_LARGE');
});
