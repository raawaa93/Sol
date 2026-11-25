import test from 'node:test';
import assert from 'node:assert/strict';
import { readOptionsWorkerConfig, runOptionsArchiveWorker } from './options-archive-worker.mjs';

test('worker config requires explicit archive root and public streams', () => {
  assert.throws(() => readOptionsWorkerConfig({}), /OPTIONS_ARCHIVE_DIR is required/);
  assert.throws(() => readOptionsWorkerConfig({ OPTIONS_ARCHIVE_DIR: '/tmp/sol' }), /OPTIONS_PUBLIC_STREAMS is required/);
});

test('worker config normalizes and deduplicates explicit public streams', () => {
  const config = readOptionsWorkerConfig({
    OPTIONS_ARCHIVE_DIR: '/tmp/sol-options',
    OPTIONS_PUBLIC_STREAMS: ' btcusdt@bookTicker,btcusdt@bookTicker,ethusdt@optionTrade ',
  });
  assert.deepEqual(config.streams, ['btcusdt@bookTicker', 'ethusdt@optionTrade']);
  assert.equal(config.maxBytes, 128 * 1024 * 1024);
  assert.equal(config.maxRuntimeMs, 60 * 60 * 1000);
  assert.equal(config.refreshExchangeInfo, false);
});

test('worker config rejects unbounded runtime, quota and malformed streams count', () => {
  assert.throws(() => readOptionsWorkerConfig({
    OPTIONS_ARCHIVE_DIR: '/tmp/sol-options',
    OPTIONS_PUBLIC_STREAMS: 'btcusdt@bookTicker',
    OPTIONS_ARCHIVE_MAX_BYTES: String(512 * 1024 * 1024 + 1),
  }), /invalid positive integer/);
  assert.throws(() => readOptionsWorkerConfig({
    OPTIONS_ARCHIVE_DIR: '/tmp/sol-options',
    OPTIONS_PUBLIC_STREAMS: 'btcusdt@bookTicker',
    OPTIONS_ARCHIVE_MAX_RUNTIME_MS: String(6 * 60 * 60 * 1000 + 1),
  }), /invalid positive integer/);
  assert.throws(() => readOptionsWorkerConfig({
    OPTIONS_ARCHIVE_DIR: '/tmp/sol-options',
    OPTIONS_PUBLIC_STREAMS: ',,,',
  }), /1–200 unique streams/);
});

test('worker records an operator stop as a verified stop, not a successful full run', async () => {
  const config = readOptionsWorkerConfig({
    OPTIONS_ARCHIVE_DIR: '/tmp/sol-options',
    OPTIONS_PUBLIC_STREAMS: 'btcusdt@bookTicker',
  });
  const events = [];
  let verified = false;
  const archive = {
    async initialize() {},
    async getArchiveBytes() { return 0; },
    async acquireWriterLease() { return { token: 'test' }; },
    async releaseWriterLease() {},
    async appendBatch() { throw new Error('unexpected append'); },
    async verify() {
      verified = true;
      return { ok: true, errors: [], segmentCount: 0 };
    },
  };
  const transport = {
    async subscribe() {
      return (async function* () {})();
    },
  };
  const controller = new AbortController();
  controller.abort(new Error('test-stop'));
  const result = await runOptionsArchiveWorker({
    config,
    archive,
    transport,
    signal: controller.signal,
    logger: (entry) => events.push(entry),
  });
  assert.equal(result.stopped, true);
  assert.equal(result.stopReason, 'test-stop');
  assert.equal(verified, true);
  assert.equal(events.at(-1).type, 'worker_stopped');
});


test('worker rejects duplicate or malformed injected stream configuration', async () => {
  const base = {
    archiveRoot: '/tmp/sol-options',
    maxBytes: 1024,
    maxRuntimeMs: 10_000,
    heartbeatMs: 1_000,
    refreshExchangeInfo: false,
  };
  await assert.rejects(
    runOptionsArchiveWorker({ config: { ...base, streams: ['btcusdt@bookTicker', 'btcusdt@bookTicker'] } }),
    /validated options archive worker configuration/,
  );
  await assert.rejects(
    runOptionsArchiveWorker({ config: { ...base, streams: [''] } }),
    /validated options archive worker configuration/,
  );
});

test('worker aborts collection and fails closed when archive heartbeat health checks fail', async () => {
  const config = readOptionsWorkerConfig({
    OPTIONS_ARCHIVE_DIR: '/tmp/sol-options',
    OPTIONS_PUBLIC_STREAMS: 'btcusdt@bookTicker',
    OPTIONS_ARCHIVE_HEARTBEAT_MS: '1000',
    OPTIONS_ARCHIVE_MAX_RUNTIME_MS: '10000',
  });
  const events = [];
  let byteReads = 0;
  let released = false;
  const archive = {
    async initialize() {},
    async getArchiveBytes() {
      byteReads += 1;
      if (byteReads > 1) throw new Error('simulated archive read failure');
      return 0;
    },
    async acquireWriterLease() { return { token: 'test' }; },
    async releaseWriterLease() { released = true; },
    async appendBatch() { throw new Error('unexpected append'); },
    async verify() { return { ok: true, errors: [], segmentCount: 0 }; },
  };
  const transport = {
    async subscribe(_streams, { signal } = {}) {
      return (async function* () {
        await new Promise((resolve) => {
          if (signal?.aborted) resolve();
          else signal?.addEventListener('abort', resolve, { once: true });
        });
      })();
    },
  };
  // The worker intentionally unreferences its heartbeat timer in production.
  // Keep this offline test process alive until the first heartbeat fires.
  const keepAlive = setTimeout(() => {}, 1_500);
  try {
    await assert.rejects(
      runOptionsArchiveWorker({
        config,
        archive,
        transport,
        logger: (entry) => events.push(entry),
      }),
      /simulated archive read failure/,
    );
  } finally {
    clearTimeout(keepAlive);
  }
  assert.equal(released, true);
  assert.ok(events.some((entry) => entry.type === 'worker_health_error'));
  assert.equal(events.at(-1).type, 'worker_failed');
});
