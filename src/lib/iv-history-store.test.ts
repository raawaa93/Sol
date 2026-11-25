import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendIVHistoryObservation,
  exportIVHistory,
  loadIVHistory,
  IV_HISTORY_STORAGE_KEY,
} from './iv-history-store.ts';
import { BINANCE_MARK_IV_SOURCE, type IVHistoryObservation } from './iv-history.ts';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function observation(index = 0, overrides: Partial<IVHistoryObservation> = {}): IVHistoryObservation {
  const capturedAt = new Date(Date.parse('2026-11-25T07:00:00.000Z') - index * 1000).toISOString();
  return {
    schemaVersion: 1,
    id: 'sample-' + index,
    underlying: 'BTC',
    venue: 'BINANCE',
    convention: 'ATM_30D_VARIANCE_INTERPOLATED',
    iv: 0.5,
    tenorDays: 30,
    capturedAt,
    receivedAt: capturedAt,
    source: 'BINANCE_REST_MARK',
    sourceRef: BINANCE_MARK_IV_SOURCE,
    contractCount: 4,
    expiryCount: 2,
    ...overrides,
  };
}

test('loads an empty versioned history when local storage has no archive', () => {
  const result = loadIVHistory(new MemoryStorage());
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.observations, []);
});

test('appends valid observations and exact duplicate IDs idempotently', () => {
  const storage = new MemoryStorage();
  const first = appendIVHistoryObservation(storage, observation(), '2026-11-25T07:00:00.000Z');
  const duplicate = appendIVHistoryObservation(storage, observation(), '2026-11-25T07:00:00.000Z');
  assert.equal(first.ok, true);
  assert.equal(first.added, true);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.added, false);
  const loaded = loadIVHistory(storage);
  assert.equal(loaded.ok, true);
  if (loaded.ok) assert.equal(loaded.observations.length, 1);
});

test('rejects an ID collision when the same observation ID has different values', () => {
  const storage = new MemoryStorage();
  appendIVHistoryObservation(storage, observation(), '2026-11-25T07:00:00.000Z');
  const conflict = appendIVHistoryObservation(storage, observation(0, { iv: 0.7 }), '2026-11-25T07:00:00.000Z');
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.reason, 'ID_CONFLICT');
});

test('rejects synthetic and malformed records instead of upgrading their provenance', () => {
  const storage = new MemoryStorage();
  const result = appendIVHistoryObservation(
    storage,
    observation(0, { source: 'SYNTHETIC' }),
    '2026-11-25T07:00:00.000Z',
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'INVALID_OBSERVATION');
});

test('corrupt or unknown-version local storage is preserved and reported', () => {
  const storage = new MemoryStorage();
  storage.setItem(IV_HISTORY_STORAGE_KEY, '{bad json');
  const loaded = loadIVHistory(storage);
  assert.equal(loaded.ok, false);
  if (!loaded.ok) assert.equal(loaded.reason, 'CORRUPT_STORAGE');
  const append = appendIVHistoryObservation(storage, observation(), '2026-11-25T07:00:00.000Z');
  assert.equal(append.ok, false);
  if (!append.ok) assert.equal(append.reason, 'CORRUPT_STORAGE');
  assert.equal(storage.getItem(IV_HISTORY_STORAGE_KEY), '{bad json');
});

test('bounds retained history by age and maximum record count', () => {
  const storage = new MemoryStorage();
  appendIVHistoryObservation(storage, observation(500 * 86_400, { id: 'old' }), '2026-11-25T07:00:00.000Z', { maxAgeDays: 400, maxObservations: 2 });
  appendIVHistoryObservation(storage, observation(2, { id: 'two' }), '2026-11-25T07:00:00.000Z', { maxAgeDays: 400, maxObservations: 2 });
  appendIVHistoryObservation(storage, observation(1, { id: 'one' }), '2026-11-25T07:00:00.000Z', { maxAgeDays: 400, maxObservations: 2 });
  appendIVHistoryObservation(storage, observation(0, { id: 'zero' }), '2026-11-25T07:00:00.000Z', { maxAgeDays: 400, maxObservations: 2 });
  const loaded = loadIVHistory(storage);
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.observations.length, 2);
    assert.deepEqual(loaded.observations.map((item) => item.id), ['one', 'zero']);
  }
});

test('storage quota failures are surfaced without claiming persistence', () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
  };
  const result = appendIVHistoryObservation(storage, observation(), '2026-11-25T07:00:00.000Z');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'STORAGE_UNAVAILABLE');
});

test('exports a versioned JSON backup with its observation provenance intact', () => {
  const storage = new MemoryStorage();
  appendIVHistoryObservation(storage, observation(), '2026-11-25T07:00:00.000Z');
  const result = exportIVHistory(storage);
  assert.equal(result.ok, true);
  if (result.ok) {
    const backup = JSON.parse(result.json);
    assert.equal(backup.schemaVersion, 1);
    assert.equal(backup.observations[0].source, 'BINANCE_REST_MARK');
    assert.equal(backup.observations[0].sourceRef, BINANCE_MARK_IV_SOURCE);
  }
});
