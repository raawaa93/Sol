import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile, unlink, symlink, stat } from 'node:fs/promises';
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

async function walkArchiveSegments(root) {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name.endsWith('.ndjson')) found.push(path);
    }
  }
  await walk(join(root, 'segments'));
  return found;
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

test('archive schema rejects source-kind mismatches and observed null values', () => {
  assert.throws(
    () => makeRecord({ endpoint: 'WS_OPTION_TRADE' }),
    (error) => error instanceof OptionsArchiveError && error.code === 'KIND_ENDPOINT_MISMATCH',
  );
  const record = makeRecord();
  assert.throws(
    () => makeRecord({ fields: [{ ...record.fields[0], value: null }] }),
    (error) => error instanceof OptionsArchiveError && error.code === 'FIELD_VALUE_REQUIRED',
  );
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

test('concurrent stale-lease recovery never removes a newly acquired writer lease', async (t) => {
  const { root, archive } = await makeArchive(t);
  const second = new ResumableOptionsArchive(root);
  await second.initialize();
  await writeFile(join(root, '.writer.lock'), JSON.stringify({
    token: 'expired-owner',
    pid: 2_147_483_647,
    host: process.env.HOSTNAME ?? 'local',
    expiresAt: Date.now() - 10_000,
  }), { mode: 0o600 });

  const attempts = await Promise.allSettled([
    archive.acquireWriterLease(),
    second.acquireWriterLease(),
  ]);
  const acquired = attempts.filter((attempt) => attempt.status === 'fulfilled');
  assert.equal(acquired.length, 1, 'exactly one contender must own the recovered lease');
  const lease = acquired[0].value;
  const current = JSON.parse(await readFile(join(root, '.writer.lock'), 'utf8'));
  assert.equal(current.token, lease.token, 'the active owner token must remain in the lock file');
  const rejected = attempts.find((attempt) => attempt.status === 'rejected');
  assert.ok(rejected?.reason instanceof OptionsArchiveError);
  assert.ok(['WRITER_LEASE_HELD', 'WRITER_LEASE_RECOVERY_BUSY'].includes(rejected.reason.code));
  await (attempts[0].status === 'fulfilled' ? archive : second).releaseWriterLease(lease);
});

test('expired writer and abandoned recovery locks can be reclaimed without deleting a live recovery lock', async (t) => {
  const { root, archive } = await makeArchive(t);
  const writerPath = join(root, '.writer.lock');
  const recoveryPath = join(root, '.writer.recovery.lock');
  const host = process.env.HOSTNAME ?? 'local';
  await writeFile(writerPath, JSON.stringify({
    token: 'expired-writer',
    pid: process.pid + 1_000_000,
    host,
    expiresAt: Date.now() - 1_000,
  }));
  await writeFile(recoveryPath, JSON.stringify({
    token: 'abandoned-recovery',
    pid: process.pid + 2_000_000,
    host,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
  }));
  const lease = await archive.acquireWriterLease();
  await archive.releaseWriterLease(lease);
  await assert.rejects(readFile(recoveryPath, 'utf8'), (error) => error.code === 'ENOENT');

  await writeFile(writerPath, JSON.stringify({
    token: 'expired-writer-2',
    pid: process.pid + 3_000_000,
    host,
    expiresAt: Date.now() - 1_000,
  }));
  await writeFile(recoveryPath, JSON.stringify({
    token: 'live-recovery',
    pid: process.pid,
    host,
    createdAt: new Date().toISOString(),
  }));
  await assert.rejects(
    archive.acquireWriterLease(),
    (error) => error instanceof OptionsArchiveError && error.code === 'WRITER_LEASE_RECOVERY_BUSY',
  );
  assert.equal(JSON.parse(await readFile(writerPath, 'utf8')).token, 'expired-writer-2');
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

test('restart replays a partially committed multi-partition batch before advancing the cursor', async (t) => {
  const { root, archive } = await makeArchive(t);
  const book = makeRecord();
  const index = makeRecord({
    kind: 'INDEX_PRICE',
    endpoint: 'WS_INDEX_PRICE',
    symbol: 'BTCUSDT',
    idempotencyKey: 'index|BTCUSDT|event-42',
    contractSpec: null,
    contractSpecObservedAt: undefined,
    contractSpecAvailableAt: undefined,
    fields: [{
      name: 'indexPrice',
      value: 99000,
      unit: 'USDT_PER_BTC',
      provenance: 'OBSERVED',
      sourcePath: 'p',
      exchangeEventAt: EVENT,
      receivedAt: RECEIVED,
      availableAt: AVAILABLE,
      staleAfterMs: 5000,
    }],
  });
  await withLease(archive, async (lease) => {
    await archive.appendBatch([book], { lease, cursor: { updateId: 42 } });
  });
  await unlink(join(root, 'cursor.json'));
  const restarted = new ResumableOptionsArchive(root);
  await restarted.initialize();
  await withLease(restarted, async (lease) => {
    const replay = await restarted.appendBatch([book, index], { lease, cursor: { updateId: 43 } });
    assert.equal(replay.appended, 1);
    assert.equal(replay.duplicates, 1);
    assert.equal(replay.segments.length, 1);
    assert.equal((await restarted.readCursor()).source.updateId, 43);
  });
  const report = await restarted.verify();
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.equal(report.index.length, 2);
});

test('cursor checksum corruption blocks archive initialization', async (t) => {
  const { root, archive } = await makeArchive(t);
  await withLease(archive, (lease) => archive.appendBatch([makeRecord()], { lease, cursor: { updateId: 42 } }));
  await writeFile(join(root, 'cursor.json'), JSON.stringify({
    schemaVersion: 1,
    value: { updateId: 43 },
    updatedAt: RECEIVED,
    checksum: '0'.repeat(64),
  }));
  const restarted = new ResumableOptionsArchive(root);
  await assert.rejects(
    restarted.initialize(),
    (error) => error instanceof OptionsArchiveError && error.code === 'ARCHIVE_CORRUPT',
  );
});

test('restore refuses a corrupted archive and does not publish a partial destination', async (t) => {
  const { root, archive } = await makeArchive(t);
  await withLease(archive, (lease) => archive.appendBatch([makeRecord()], { lease }));
  const segmentFiles = await walkArchiveSegments(root);
  await writeFile(segmentFiles[0], (await readFile(segmentFiles[0], 'utf8')) + 'tamper');
  const destination = join(root, '..', `sol-options-restore-corrupt-${Date.now()}`);
  await assert.rejects(
    ResumableOptionsArchive.restore(root, destination),
    (error) => error instanceof OptionsArchiveError && error.code === 'ARCHIVE_CORRUPT',
  );
  await assert.rejects(stat(destination), (error) => error.code === 'ENOENT');
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

test('orphaned temporary segments are removed under the writer lease before the next append', async (t) => {
  const { root, archive } = await makeArchive(t);
  const orphan = join(root, '.tmp', 'crashed-writer.ndjson.tmp');
  await writeFile(orphan, 'partial-segment');
  await withLease(archive, async (lease) => {
    await archive.appendBatch([makeRecord()], { lease });
    await assert.rejects(readFile(orphan, 'utf8'), (error) => error.code === 'ENOENT');
  });
  assert.equal((await archive.verify()).ok, true);
});

test('restart recovers orphan temp segments only after acquiring the exclusive writer lease', async (t) => {
  const { root, archive } = await makeArchive(t);
  const orphan = join(root, '.tmp', 'crash-before-link.ndjson.tmp');
  const cursorOrphan = join(root, '.tmp', 'crash-during-cursor.ndjson.tmp');
  await writeFile(orphan, 'partial-segment');
  await writeFile(cursorOrphan, 'partial-cursor');
  const restarted = new ResumableOptionsArchive(root);
  const initialized = await restarted.initialize();
  assert.equal(initialized.ok, true);
  assert.ok(initialized.errors.some((error) => error.startsWith('ORPHAN_TEMP_FILE')));
  const lease = await restarted.acquireWriterLease();
  try {
    await assert.rejects(readFile(orphan, 'utf8'), (error) => error.code === 'ENOENT');
    await assert.rejects(readFile(cursorOrphan, 'utf8'), (error) => error.code === 'ENOENT');
    await restarted.appendBatch([makeRecord()], { lease, cursor: { updateId: 42 } });
  } finally {
    await restarted.releaseWriterLease(lease);
  }
  const report = await restarted.verify();
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.equal(report.index.length, 1);
});

test('archive verification rejects symbolic links instead of reading outside the archive root', async (t) => {
  const { root, archive } = await makeArchive(t);
  const outside = join(root, 'outside-secret.txt');
  await writeFile(outside, 'not part of archive');
  await symlink(outside, join(root, 'segments', 'outside-link'));
  await assert.rejects(
    archive.verify(),
    (error) => error instanceof OptionsArchiveError && error.code === 'SYMLINK_NOT_ALLOWED',
  );
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

test('export recovers orphaned temporary files before integrity verification', async (t) => {
  const { root, archive } = await makeArchive(t);
  await withLease(archive, (lease) => archive.appendBatch([makeRecord()], { lease }));
  const orphan = join(root, '.tmp', 'crashed-export.ndjson.tmp');
  await writeFile(orphan, 'partial');
  const destination = join(root, '..', `sol-options-export-recovery-${Date.now()}`);
  t.after(() => rm(destination, { recursive: true, force: true }));
  const report = await archive.exportTo(destination);
  assert.equal(report.ok, true, report.errors.join('; '));
  await assert.rejects(readFile(orphan, 'utf8'), (error) => error.code === 'ENOENT');
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

test('incomplete or not-yet-available contract terms cannot authorize PIT eligibility', () => {
  assert.throws(
    () => makeRecord({ contractSpec: { symbol: CONTRACT.symbol, unit: 100 } }),
    (error) => error instanceof OptionsArchiveError && error.code === 'CONTRACT_SPEC_INCOMPLETE',
  );
  const lateSpec = makeRecord({ contractSpecAvailableAt: '2026-11-25T03:00:02.000Z' });
  assert.ok(evaluateOptionsPointInTime(lateSpec, '2026-11-25T03:00:01.000Z', ['bid']).reasons.includes('CONTRACT_SPEC_LOOKAHEAD'));
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
