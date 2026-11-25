import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalJson,
  createOptionsArchiveRecord,
  evaluateOptionsPointInTime,
  OptionsArchiveError,
  ResumableOptionsArchive,
} from './options-archive.mjs';

const EVENT = '2026-11-25T03:00:00.000Z';
const RECEIVED = '2026-11-25T03:00:00.100Z';
const AVAILABLE = '2026-11-25T03:00:00.200Z';
const CONTRACT = {
  symbol: 'BTC-261225-100000-C', underlying: 'BTC', optionType: 'CALL', strike: 100_000,
  expiryAt: '2026-12-25T08:00:00.000Z', unit: 100, premiumUnit: 'PER_CONTRACT',
  quoteAsset: 'USDT', settlementAsset: 'USDT', exerciseStyle: 'EUROPEAN', settlementStyle: 'CASH',
  cashSettlementMultiplier: 100, sourceEndpoint: 'REST_EXCHANGE_INFO', version: 'exchangeInfo-2026-11-25T03:00:00.000Z',
};

function makeRecord(overrides = {}) {
  const field = {
    name: 'bid',
    value: 1200,
    unit: 'USDT_PER_CONTRACT',
    provenance: 'OBSERVED',
    sourcePath: 'b',
    exchangeEventAt: EVENT,
    receivedAt: RECEIVED,
    availableAt: AVAILABLE,
    staleAfterMs: 1_000,
  };
  return createOptionsArchiveRecord({
    kind: 'BOOK_TICKER',
    endpoint: 'WS_BOOK_TICKER',
    symbol: 'BTC-261225-100000-C',
    idempotencyKey: 'bookTicker|BTC-261225-100000-C|update-42',
    rawPayload: { e: 'bookTicker', E: Date.parse(EVENT), u: 42, s: 'BTC-261225-100000-C', b: '1200' },
    clocks: { exchangeEventAt: EVENT, receivedAt: RECEIVED, availableAt: AVAILABLE },
    contractSpec: CONTRACT,
    contractSpecObservedAt: EVENT,
    contractSpecAvailableAt: RECEIVED,
    fields: [field],
    quality: { status: 'VALID', flags: [] },
    historicalBackfill: false,
    ...overrides,
  });
}

async function makeArchive(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sol-options-archive-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = new ResumableOptionsArchive(root, options);
  await archive.initialize();
  return { root, archive };
}

async function withLease(archive, fn) {
  const lease = await archive.acquireWriterLease();
  try { return await fn(lease); } finally { await archive.releaseWriterLease(lease); }
}

test('canonical JSON is deterministic and archive records retain raw-payload hashes', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  const record = makeRecord();
  assert.equal(record.provider, 'BINANCE');
  assert.equal(record.schemaVersion, 1);
  assert.equal(typeof record.rawPayloadSha256, 'string');
  assert.equal(record.contractSpecFingerprint.length, 64);
});

test('archive commits a content-addressed segment and deduplicates deterministic retries', async (t) => {
  const { archive } = await makeArchive(t);
  const record = makeRecord();
  await withLease(archive, async (lease) => {
    const first = await archive.appendBatch([record], { lease, cursor: { stream: 'bookTicker', updateId: 42 } });
    assert.equal(first.appended, 1);
    assert.equal(first.duplicates, 0);
    assert.equal(first.segments.length, 1);
    assert.equal(first.segments[0].hash.length, 64);
    const second = await archive.appendBatch([record], { lease, cursor: { stream: 'bookTicker', updateId: 42 } });
    assert.equal(second.appended, 0);
    assert.equal(second.duplicates, 1);
    assert.equal(await archive.readCursor().then((value) => value.source.updateId), 42);
  });
  const report = await archive.verify();
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.equal(report.index.length, 1);
  assert.equal(report.segmentCount, 1);
});

test('same idempotency key with different evidence is rejected, never overwritten', async (t) => {
  const { archive } = await makeArchive(t);
  const original = makeRecord();
  const conflicting = makeRecord({ rawPayload: { e: 'bookTicker', E: Date.parse(EVENT), u: 43, s: CONTRACT.symbol, b: '1201' } });
  await withLease(archive, async (lease) => {
    await archive.appendBatch([original], { lease });
    await assert.rejects(
      archive.appendBatch([conflicting], { lease }),
      (error) => error instanceof OptionsArchiveError && error.code === 'IDEMPOTENCY_CONFLICT',
    );
  });
  assert.equal((await archive.verify()).index.length, 1);
});

test('writer lease prevents a second process/instance from writing concurrently', async (t) => {
  const { root, archive } = await makeArchive(t);
  const second = new ResumableOptionsArchive(root);
  await second.initialize();
  const lease = await archive.acquireWriterLease();
  await assert.rejects(
    second.acquireWriterLease(),
    (error) => error instanceof OptionsArchiveError && error.code === 'WRITER_LEASE_HELD',
  );
  await archive.releaseWriterLease(lease);
  const recovered = await second.acquireWriterLease();
  await second.releaseWriterLease(recovered);
});

test('restart after a durable segment but before cursor update is safely replayable', async (t) => {
  const { root, archive } = await makeArchive(t);
  const record = makeRecord();
  await withLease(archive, (lease) => archive.appendBatch([record], { lease, cursor: { updateId: 42 } }));
  await unlink(join(root, 'cursor.json'));
  const restarted = new ResumableOptionsArchive(root);
  await restarted.initialize();
  assert.equal(await restarted.readCursor(), null);
  await withLease(restarted, async (lease) => {
    const replay = await restarted.appendBatch([record], { lease, cursor: { updateId: 42 } });
    assert.equal(replay.appended, 0);
    assert.equal(replay.duplicates, 1);
    assert.equal((await restarted.readCursor()).source.updateId, 42);
  });
  assert.equal((await restarted.verify()).ok, true);
});

test('tampered segment is detected by its content hash', async (t) => {
  const { root, archive } = await makeArchive(t);
  await withLease(archive, (lease) => archive.appendBatch([makeRecord()], { lease }));
  const files = await readdir(join(root, 'segments', 'book_ticker', ''));
  assert.equal(files.length, 1);
  const symbolDir = join(root, 'segments', 'book_ticker', files[0]);
  const symbolEntries = await readdir(symbolDir);
  const dateDir = join(symbolDir, symbolEntries[0]);
  const segmentName = (await readdir(dateDir))[0];
  const segmentPath = join(dateDir, segmentName);
  await writeFile(segmentPath, (await readFile(segmentPath, 'utf8')) + 'tampered');
  const report = await archive.verify();
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((error) => error.startsWith('SEGMENT_HASH_MISMATCH')));
});

test('quota failure writes neither a segment nor a cursor', async (t) => {
  const { root, archive } = await makeArchive(t, { maxBytes: 1 });
  await withLease(archive, async (lease) => {
    await assert.rejects(
      archive.appendBatch([makeRecord()], { lease, cursor: { updateId: 42 } }),
      (error) => error instanceof OptionsArchiveError && error.code === 'ARCHIVE_QUOTA_EXCEEDED',
    );
  });
  assert.equal(await archive.getArchiveBytes(), 0);
  await assert.rejects(readFile(join(root, 'cursor.json'), 'utf8'), (error) => error.code === 'ENOENT');
});

test('verified export and restore preserve segment and cursor integrity', async (t) => {
  const { root, archive } = await makeArchive(t);
  await withLease(archive, (lease) => archive.appendBatch([makeRecord()], { lease, cursor: { updateId: 42 } }));
  const exported = join(root, '..', `sol-options-export-${Date.now()}`);
  const restoredPath = join(root, '..', `sol-options-restore-${Date.now()}`);
  t.after(() => rm(exported, { recursive: true, force: true }));
  t.after(() => rm(restoredPath, { recursive: true, force: true }));
  const exportReport = await archive.exportTo(exported);
  assert.equal(exportReport.ok, true, exportReport.errors.join('; '));
  const restoreReport = await ResumableOptionsArchive.restore(exported, restoredPath);
  assert.equal(restoreReport.ok, true, restoreReport.errors.join('; '));
  assert.equal(restoreReport.index.length, 1);
});

test('point-in-time gate rejects future, stale, backfilled and modelled observations', () => {
  const record = makeRecord();
  assert.equal(evaluateOptionsPointInTime(record, '2026-11-25T03:00:01.000Z', ['bid']).eligible, true);
  assert.ok(evaluateOptionsPointInTime(record, '2026-11-25T03:00:05.000Z', ['bid']).reasons.includes('FIELD_STALE_OR_UNBOUNDED:bid'));
  assert.ok(evaluateOptionsPointInTime(makeRecord({ historicalBackfill: true }), '2026-11-25T03:00:01.000Z', ['bid']).reasons.includes('HISTORICAL_BACKFILL'));
  const modelled = makeRecord({ fields: [{ ...record.fields[0], provenance: 'MODELLED' }] });
  assert.ok(evaluateOptionsPointInTime(modelled, '2026-11-25T03:00:01.000Z', ['bid']).reasons.includes('FIELD_NOT_OBSERVED:bid'));
  const noEventTime = makeRecord({ fields: [{ ...record.fields[0], exchangeEventAt: null }] });
  assert.ok(evaluateOptionsPointInTime(noEventTime, '2026-11-25T03:00:01.000Z', ['bid']).reasons.includes('EVENT_TIME_MISSING:bid'));
});

test('future source events and malformed source timestamps are rejected at ingestion', () => {
  assert.throws(
    () => makeRecord({ clocks: { exchangeEventAt: '2026-11-25T03:01:00Z', receivedAt: RECEIVED, availableAt: AVAILABLE } }),
    (error) => error instanceof OptionsArchiveError && error.code === 'FUTURE_EVENT',
  );
  assert.throws(
    () => makeRecord({ clocks: { exchangeEventAt: null, receivedAt: 'bad', availableAt: AVAILABLE } }),
    (error) => error instanceof OptionsArchiveError && error.code === 'INVALID_TIMESTAMP',
  );
});
