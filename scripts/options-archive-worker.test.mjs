import test from 'node:test';
import assert from 'node:assert/strict';
import { readOptionsWorkerConfig } from './options-archive-worker.mjs';

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
});
