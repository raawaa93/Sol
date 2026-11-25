import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateOptionsPointInTime, ResumableOptionsArchive } from './options-archive.mjs';
import {
  buildPublicBinanceRestUrl,
  collectForwardOptionsEvents,
  createFakeOptionsTransport,
  OptionsCollectorError,
  mapVerifiedBinanceContractSpec,
  parseBinancePublicStreamEvent,
  requestPublicBinanceRest,
} from './options-collector.mjs';

const EVENT_MS = Date.parse('2026-11-25T03:00:00.000Z');
const RECEIVED = '2026-11-25T03:00:01.000Z';
const SYMBOL = 'BTC-261225-100000-C';

async function makeArchive(t) {
  const root = await mkdtemp(join(tmpdir(), 'sol-options-collector-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = new ResumableOptionsArchive(root);
  await archive.initialize();
  return archive;
}

async function listFiles(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(path));
    else result.push(path);
  }
  return result;
}

function exchangeInfoFixture() {
  return {
    serverTime: EVENT_MS,
    optionContracts: [{
      baseAsset: 'BTC', quoteAsset: 'USDT', underlying: 'BTCUSDT',
      settleAsset: 'USDT',
    }],
    optionSymbols: [{
      symbol: SYMBOL, underlying: 'BTCUSDT', quoteAsset: 'USDT', side: 'CALL',
      strikePrice: '100000', expiryDate: Date.parse('2026-12-25T08:00:00.000Z'),
      unit: '100', contractType: 'CRYPTO_OPTIONS', underlyingType: 'CRYPTO', status: 'TRADING',
    }],
  };
}

test('REST URL builder only exposes the public Options allowlist and rejects private/arbitrary parameters', () => {
  const depth = buildPublicBinanceRestUrl('depth', { symbol: SYMBOL, limit: 20 });
  assert.equal(depth.origin, 'https://eapi.binance.com');
  assert.equal(depth.pathname, '/eapi/v1/depth');
  assert.equal(depth.searchParams.get('symbol'), SYMBOL);
  assert.equal(buildPublicBinanceRestUrl('klines', { symbol: SYMBOL, interval: '8h' }).searchParams.get('interval'), '8h');
  assert.equal(buildPublicBinanceRestUrl('klines', { symbol: SYMBOL, interval: '3d' }).searchParams.get('interval'), '3d');
  assert.equal(buildPublicBinanceRestUrl('klines', { symbol: SYMBOL, interval: '1M' }).searchParams.get('interval'), '1M');
  assert.throws(() => buildPublicBinanceRestUrl('order', { symbol: SYMBOL }), (error) => error.code === 'ENDPOINT_NOT_ALLOWED');
  assert.throws(() => buildPublicBinanceRestUrl('depth', { symbol: SYMBOL, recvWindow: 5000 }), (error) => error.code === 'PARAM_NOT_ALLOWED');
  assert.throws(() => buildPublicBinanceRestUrl('index', { underlying: 'BTC', apiKey: 'secret' }), (error) => error.code === 'PARAM_NOT_ALLOWED');
  const openInterest = buildPublicBinanceRestUrl('openInterest', { underlyingAsset: 'ETH/BTC', expiration: '221225' });
  assert.equal(openInterest.searchParams.get('underlyingAsset'), 'ETH/BTC');
  assert.equal(buildPublicBinanceRestUrl('klines', { symbol: SYMBOL, interval: '1m', limit: 1500 }).searchParams.get('limit'), '1500');
  assert.equal(buildPublicBinanceRestUrl('blockTrades', { symbol: SYMBOL, limit: 500 }).pathname, '/eapi/v1/blockTrades');
  assert.throws(() => buildPublicBinanceRestUrl('recentTrades', { symbol: SYMBOL, limit: 501 }), (error) => error.code === 'LIMIT_TOO_LARGE');
  assert.throws(() => buildPublicBinanceRestUrl('depth', { symbol: SYMBOL, limit: 5 }), (error) => error.code === 'INVALID_DEPTH_LIMIT');
});

test('HTTP 451/403 eligibility responses stop without retry or alternate egress', async () => {
  let calls = 0;
  const transport = {
    async fetch() {
      calls += 1;
      return { status: 451, ok: false, json: async () => ({}) };
    },
  };
  await assert.rejects(
    requestPublicBinanceRest('exchangeInfo', {}, transport),
    (error) => error instanceof OptionsCollectorError && error.code === 'ELIGIBILITY_BLOCKED',
  );
  assert.equal(calls, 1);
});

test('exchangeInfo maps only explicit Binance Crypto Options contract terms with separate premium and cash scales', () => {
  const spec = mapVerifiedBinanceContractSpec(exchangeInfoFixture(), SYMBOL, RECEIVED);
  assert.ok(spec);
  assert.equal(spec.contractSpec.unit, 100);
  assert.equal(spec.contractSpec.premiumUnit, 'PER_CONTRACT');
  assert.equal(spec.contractSpec.premiumMultiplier, 1);
  assert.equal(spec.contractSpec.cashSettlementMultiplier, 100);
  assert.equal(spec.contractSpec.quoteAsset, 'USDT');
  assert.equal(spec.contractSpec.settlementAsset, 'USDT');
  assert.equal(spec.contractSpec.sourceEndpoint, 'REST_EXCHANGE_INFO');
  assert.equal(spec.contractSpec.termsSource, 'BINANCE_OPTIONS_CONTRACT_SPECIFICATIONS_2026-01-05');
  assert.equal(spec.contractSpec.settlementTermsSource, 'BINANCE_CLEARING_PROCEDURES_126_130');
  assert.equal(spec.contractSpec.settlementPriceMethod, 'INDEX_ARITHMETIC_MEAN');
  assert.equal(spec.contractSpec.settlementWindowMs, 30 * 60 * 1000);
  assert.equal(spec.contractSpecObservedAt, new Date(EVENT_MS).toISOString());
  assert.equal(spec.contractSpecAvailableAt, RECEIVED);
  const laterSnapshot = exchangeInfoFixture();
  laterSnapshot.serverTime = EVENT_MS + 500;
  const laterSpec = mapVerifiedBinanceContractSpec(laterSnapshot, SYMBOL, '2026-11-25T03:00:01.000Z');
  assert.equal(laterSpec.contractSpec.version, spec.contractSpec.version);
  assert.notEqual(laterSpec.contractSpecObservedAt, spec.contractSpecObservedAt);
  assert.equal(mapVerifiedBinanceContractSpec({
    ...exchangeInfoFixture(),
    optionSymbols: [{ ...exchangeInfoFixture().optionSymbols[0], underlyingType: 'EQUITY' }],
  }, SYMBOL, RECEIVED), null);
  assert.equal(mapVerifiedBinanceContractSpec({
    ...exchangeInfoFixture(),
    optionSymbols: [{ ...exchangeInfoFixture().optionSymbols[0], contractType: '' }],
  }, SYMBOL, RECEIVED), null);
  assert.equal(mapVerifiedBinanceContractSpec({
    ...exchangeInfoFixture(),
    optionContracts: [{ ...exchangeInfoFixture().optionContracts[0], settleAsset: 'USDC' }],
  }, SYMBOL, RECEIVED), null);
  assert.equal(mapVerifiedBinanceContractSpec({
    ...exchangeInfoFixture(),
    optionSymbols: [{ ...exchangeInfoFixture().optionSymbols[0], status: 'HALT' }],
  }, SYMBOL, RECEIVED), null);
  assert.equal(mapVerifiedBinanceContractSpec({
    ...exchangeInfoFixture(),
    optionSymbols: [{ ...exchangeInfoFixture().optionSymbols[0], quoteAsset: 'USDC' }],
  }, SYMBOL, RECEIVED), null);
  assert.equal(mapVerifiedBinanceContractSpec(exchangeInfoFixture(), SYMBOL, 'not-a-timestamp'), null);
  assert.equal(mapVerifiedBinanceContractSpec({
    ...exchangeInfoFixture(),
    optionSymbols: [...exchangeInfoFixture().optionSymbols, exchangeInfoFixture().optionSymbols[0]],
  }, SYMBOL, RECEIVED), null);
  assert.equal(mapVerifiedBinanceContractSpec({
    ...exchangeInfoFixture(),
    optionContracts: [...exchangeInfoFixture().optionContracts, exchangeInfoFixture().optionContracts[0]],
  }, SYMBOL, RECEIVED), null);
  assert.equal(mapVerifiedBinanceContractSpec({
    ...exchangeInfoFixture(),
    optionSymbols: [{ ...exchangeInfoFixture().optionSymbols[0], unit: '0.5' }],
  }, SYMBOL, RECEIVED), null);
  assert.equal(mapVerifiedBinanceContractSpec(exchangeInfoFixture(), SYMBOL, '2026-11-25T03:10:00.000Z'), null);
  assert.equal(mapVerifiedBinanceContractSpec({
    ...exchangeInfoFixture(),
    optionSymbols: [{ ...exchangeInfoFixture().optionSymbols[0], underlying: 'ETHUSDT' }],
  }, SYMBOL, RECEIVED), null);
});

test('collector attaches the exchangeInfo snapshot to subsequent market records and PIT gate accepts only after availability', async (t) => {
  const archive = await makeArchive(t);
  const bookTicker = {
    e: 'bookTicker', E: EVENT_MS, T: EVENT_MS - 5, u: 42, s: SYMBOL,
    b: '1200.0', B: '2.0', a: '1210.0', A: '3.0',
  };
  const haltedSnapshot = exchangeInfoFixture();
  haltedSnapshot.serverTime = EVENT_MS + 500;
  haltedSnapshot.optionSymbols[0].status = 'HALT';
  const transport = createFakeOptionsTransport([
    { type: 'exchangeInfo', payload: exchangeInfoFixture() },
    { type: 'message', data: bookTicker },
    { type: 'exchangeInfo', payload: haltedSnapshot },
    { type: 'message', data: { ...bookTicker, E: EVENT_MS + 700, T: EVENT_MS + 699, u: 43 } },
  ]);
  await collectForwardOptionsEvents({
    archive,
    transport,
    streams: ['btc-261225-100000-c@bookTicker'],
    enabled: true,
    now: () => RECEIVED,
  });
  const report = await archive.verify();
  assert.equal(report.ok, true, report.errors.join('; '));
  const records = [];
  for (const path of await listFiles(join(archive.root, 'segments'))) {
    for (const line of (await readFile(path, 'utf8')).trim().split('\n')) records.push(JSON.parse(line));
  }
  const quotes = records.filter((record) => record.kind === 'BOOK_TICKER');
  const quote = quotes.find((record) => record.contractSpec);
  const haltedQuote = quotes.find((record) => !record.contractSpec);
  assert.equal(quotes.length, 2);
  assert.ok(quote?.contractSpec);
  assert.equal(quote.contractSpec.unit, 100);
  assert.equal(quote.contractSpec.settlementPriceMethod, 'INDEX_ARITHMETIC_MEAN');
  assert.equal(quote.contractSpec.settlementWindowMs, 30 * 60 * 1000);
  assert.equal(quote.contractSpecAvailableAt, RECEIVED);
  assert.equal(evaluateOptionsPointInTime(quote, '2026-11-25T03:00:02.000Z', ['bid', 'ask']).eligible, true);
  assert.ok(evaluateOptionsPointInTime(quote, '2026-11-25T03:00:00.500Z', ['bid', 'ask']).reasons.includes('CONTRACT_SPEC_LOOKAHEAD'));
  assert.equal(haltedQuote?.contractSpec, null, 'a halted contract must not retain terms from an earlier exchangeInfo snapshot');
});

test('collector refreshes exchangeInfo through injected public REST before market events', async (t) => {
  const archive = await makeArchive(t);
  const restCalls = [];
  const restTransport = {
    async fetch(url, init) {
      restCalls.push({ url, init });
      return { status: 200, ok: true, json: async () => exchangeInfoFixture() };
    },
  };
  const bookTicker = {
    e: 'bookTicker', E: EVENT_MS, T: EVENT_MS - 5, u: 44, s: SYMBOL,
    b: '1200.0', B: '2.0', a: '1210.0', A: '3.0',
  };
  const transport = createFakeOptionsTransport([{ type: 'message', data: bookTicker }]);
  const result = await collectForwardOptionsEvents({
    archive,
    transport,
    restTransport,
    refreshExchangeInfo: true,
    streams: ['btc-261225-100000-c@bookTicker'],
    enabled: true,
    now: () => RECEIVED,
  });

  assert.equal(restCalls.length, 1);
  assert.equal(restCalls[0].url, 'https://eapi.binance.com/eapi/v1/exchangeInfo');
  assert.equal(restCalls[0].init.method, 'GET');
  assert.deepEqual(result, { processed: 1, archived: 2, gaps: 0, exchangeInfoRefreshes: 1 });
  const report = await archive.verify();
  assert.equal(report.ok, true, report.errors.join('; '));
  const records = [];
  for (const path of await listFiles(join(archive.root, 'segments'))) {
    for (const line of (await readFile(path, 'utf8')).trim().split('\\n')) records.push(JSON.parse(line));
  }
  assert.equal(records.filter((record) => record.kind === 'EXCHANGE_INFO').length, 1);
  const quote = records.find((record) => record.kind === 'BOOK_TICKER');
  assert.equal(quote?.contractSpec?.unit, 100);
  assert.equal(quote?.contractSpecAvailableAt, RECEIVED);
});

test('collector refuses to attach an expired exchangeInfo snapshot to later market events', async (t) => {
  const archive = await makeArchive(t);
  const staleBookTicker = {
    e: 'bookTicker',
    E: Date.parse('2026-11-25T03:06:00.000Z'),
    T: Date.parse('2026-11-25T03:05:59.000Z'),
    u: 43,
    s: SYMBOL,
    b: '1200.0', B: '2.0', a: '1210.0', A: '3.0',
  };
  const times = [RECEIVED, '2026-11-25T03:06:01.000Z'];
  const transport = createFakeOptionsTransport([
    { type: 'exchangeInfo', payload: exchangeInfoFixture() },
    { type: 'message', data: staleBookTicker },
  ]);
  await collectForwardOptionsEvents({
    archive,
    transport,
    streams: ['btc-261225-100000-c@bookTicker'],
    enabled: true,
    now: () => times.shift(),
  });
  const report = await archive.verify();
  assert.equal(report.ok, true, report.errors.join('; '));
  const records = [];
  for (const path of await listFiles(join(archive.root, 'segments'))) {
    for (const line of (await readFile(path, 'utf8')).trim().split('\n')) records.push(JSON.parse(line));
  }
  const quote = records.find((record) => record.kind === 'BOOK_TICKER');
  assert.equal(quote?.contractSpec, null);
  assert.ok(evaluateOptionsPointInTime(quote, '2026-11-25T03:06:02.000Z', ['bid', 'ask']).reasons.includes('CONTRACT_SPEC_UNAVAILABLE'));
});

test('book ticker parser preserves event and transaction times, raw fields, and crossed-book quality', () => {
  const event = {
    e: 'bookTicker', E: EVENT_MS, T: EVENT_MS - 5, u: 42, s: SYMBOL,
    b: '1200.0', B: '2.0', a: '1210.0', A: '3.0',
  };
  const [record] = parseBinancePublicStreamEvent(event, RECEIVED, { depth: new Map() });
  assert.equal(record.kind, 'BOOK_TICKER');
  assert.equal(record.clocks.exchangeEventAt, new Date(EVENT_MS).toISOString());
  assert.equal(record.rawPayload.T, EVENT_MS - 5);
  assert.equal(record.fields.find((field) => field.name === 'bid').value, 1200);
  assert.equal(record.fields.find((field) => field.name === 'transactionTime').value, EVENT_MS - 5);
  const [crossed] = parseBinancePublicStreamEvent({ ...event, b: '1220', a: '1210', u: 43 }, RECEIVED, { depth: new Map() });
  assert.equal(crossed.quality.status, 'INVALID');
  assert.ok(crossed.quality.flags.includes('CROSSED_BOOK'));
});

test('trade MARKET and BLOCK are separate; taker side is derived only from maker flag m', () => {
  const market = {
    e: 'trade', E: EVENT_MS, T: EVENT_MS - 10, s: SYMBOL, t: 101,
    p: '1200', q: '0.5', X: 'MARKET', S: 'BUY', m: true,
  };
  const block = { ...market, t: 102, X: 'BLOCK', S: 'BUY', m: false };
  const [marketRecord] = parseBinancePublicStreamEvent(market, RECEIVED);
  const [blockRecord] = parseBinancePublicStreamEvent(block, RECEIVED);
  assert.equal(marketRecord.kind, 'TRADE_MARKET');
  assert.equal(blockRecord.kind, 'TRADE_BLOCK');
  assert.equal(marketRecord.fields.find((field) => field.name === 'aggressorSide').value, 'SELL');
  assert.equal(blockRecord.fields.find((field) => field.name === 'aggressorSide').value, 'BUY');
  assert.equal(marketRecord.fields.find((field) => field.name === 'tradeTime').value, EVENT_MS - 10);
  assert.equal(marketRecord.rawPayload.T, EVENT_MS - 10);
  const { T: _ignored, ...withoutT } = market;
  const [withoutTransactionTime] = parseBinancePublicStreamEvent({ ...withoutT, t: 104 }, RECEIVED);
  assert.equal(withoutTransactionTime.fields.some((field) => field.name === 'tradeTime'), false);
  const [unknown] = parseBinancePublicStreamEvent({ ...market, t: 103, X: 'UNKNOWN' }, RECEIVED);
  assert.equal(unknown.kind, 'GAP');
  assert.ok(unknown.quality.flags.includes('UNKNOWN_TRADE_TYPE'));
});

test('forming klines are ignored and closed candles are unavailable before their close time', () => {
  const forming = { e: 'kline', E: EVENT_MS, s: SYMBOL, k: { s: SYMBOL, i: '1m', t: EVENT_MS - 60_000, T: EVENT_MS, x: false, o: '1', h: '2', l: '1', c: '2', v: '3' } };
  assert.deepEqual(parseBinancePublicStreamEvent(forming, RECEIVED), []);
  const closed = { ...forming, k: { ...forming.k, T: EVENT_MS + 5_000, x: true } };
  const [record] = parseBinancePublicStreamEvent(closed, '2026-11-25T03:00:01.000Z');
  assert.equal(record.kind, 'KLINE_CLOSED');
  assert.equal(record.clocks.availableAt, '2026-11-25T03:00:05.000Z');
  assert.ok(record.fields.every((field) => field.availableAt >= '2026-11-25T03:00:05.000Z'));
});

test('depth diffs remain invalid until a snapshot bridge and sequence gaps are explicit', async (t) => {
  const archive = await makeArchive(t);
  const snapshot = {
    type: 'depthSnapshot', symbol: SYMBOL, lastUpdateId: 100,
    payload: { lastUpdateId: 100, T: EVENT_MS, bids: [['1200', '1']], asks: [['1210', '2']] },
    bids: [['1200', '1']], asks: [['1210', '2']],
  };
  const diff = (U, u, pu) => ({
    e: 'depthUpdate', E: EVENT_MS, T: EVENT_MS - 1, s: SYMBOL, U, u, pu,
    b: [['1200', '1']], a: [['1210', '2']],
  });
  const transport = createFakeOptionsTransport([
    snapshot,
    { type: 'message', data: diff(101, 102, 100) },
    { type: 'message', data: diff(103, 104, 102) },
    { type: 'message', data: diff(110, 111, 103) },
    { type: 'disconnect', reason: 'network-close' },
    { type: 'reconnect' },
    { type: 'message', data: diff(112, 113, 111) },
  ]);
  const result = await collectForwardOptionsEvents({
    archive,
    transport,
    streams: ['btc-261225-100000-c@depth@100ms'],
    enabled: true,
    now: () => RECEIVED,
  });
  assert.equal(result.processed, 7);
  assert.ok(result.gaps >= 4);
  const report = await archive.verify();
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.ok(report.index.length >= 7);
});

test('collector accepts current public Binance Options stream names and rejects obsolete aliases', async (t) => {
  const archive = await makeArchive(t);
  const streams = [
    'btc-261225-100000-c@bookTicker',
    'btc-261225-100000-c@optionTrade',
    'btc-261225-100000-c@optionTicker',
    'btcusdt@optionTicker261225',
    'btcusdt@optionMarkPrice',
    '!index@arr',
    'btc-261225-100000-c@kline_1m',
    'btc-261225-100000-c@kline_8h',
    'btc-261225-100000-c@kline_3d',
    'btc-261225-100000-c@kline_1w',
    'btc-261225-100000-c@kline_1M',
    'btc-261225-100000-c@depth@100ms',
  ];
  let subscribed;
  await collectForwardOptionsEvents({
    archive,
    transport: { subscribe: async (requested) => { subscribed = requested; return []; } },
    streams,
    enabled: true,
    now: () => RECEIVED,
  });
  assert.deepEqual(subscribed, streams);
  await assert.rejects(
    collectForwardOptionsEvents({
      archive,
      transport: { subscribe: async () => [] },
      streams: ['btcusdt@index'],
      enabled: true,
      now: () => RECEIVED,
    }),
    (error) => error.code === 'INVALID_STREAMS',
  );
});

test('index and mark price stream arrays are parsed into independent raw archive records', () => {
  const indexEvents = [
    { e: 'indexPrice', E: EVENT_MS, s: 'BTCUSDT', p: '120000.0' },
    { e: 'indexPrice', E: EVENT_MS, s: 'ETHUSDT', p: '4000.0' },
  ];
  const indexRecords = parseBinancePublicStreamEvent(indexEvents, RECEIVED);
  assert.equal(indexRecords.length, 2);
  assert.ok(indexRecords.every((record) => record.kind === 'INDEX_PRICE'));

  const markEvents = [{
    e: 'optionMarkPrice', E: EVENT_MS, s: SYMBOL, mp: '1250.0', vo: '0.42',
    d: '0.55', t: '-12', g: '0.0001', v: '22',
  }];
  const markRecords = parseBinancePublicStreamEvent(markEvents, RECEIVED);
  assert.equal(markRecords.length, 1);
  assert.equal(markRecords[0].kind, 'MARK_PRICE');
  assert.equal(markRecords[0].symbol, SYMBOL);
});

test('forward collection accepts the documented public Options stream names', async () => {
  const lease = { expiresAt: Date.now() + 60_000 };
  const archive = {
    async acquireWriterLease() { return lease; },
    async releaseWriterLease() {},
  };
  const transport = {
    async subscribe() {
      return (async function* () {})();
    },
  };
  const streams = [
    'btcusdt@bookTicker',
    'btcusdt@optionTrade',
    'btcusdt@optionTicker251230',
    'btcusdt@optionMarkPrice',
    'btcusdt@markPrice',
    '!index@arr',
    'btc-261225-100000-c@kline_1m',
    'btc-261225-100000-c@depth@100ms',
    'btc-261225-100000-c@depth10@500ms',
  ];
  const result = await collectForwardOptionsEvents({ archive, transport, streams, enabled: true });
  assert.deepEqual(result, { processed: 0, archived: 0, gaps: 0, exchangeInfoRefreshes: 0 });
});

test('forward collection is disabled by default and rejects private stream names', async () => {
  const archive = { acquireWriterLease: async () => { throw new Error('must not acquire'); } };
  await assert.rejects(
    collectForwardOptionsEvents({ archive, transport: {}, streams: ['btc@bookTicker'] }),
    (error) => error.code === 'COLLECTOR_DISABLED',
  );
  await assert.rejects(
    collectForwardOptionsEvents({ archive, transport: { subscribe: async () => [] }, streams: ['listenKey@orderReport'], enabled: true }),
    (error) => error.code === 'INVALID_STREAMS',
  );
});
