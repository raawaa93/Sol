import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateBinanceOptionTradeFlow,
  deduplicateBinanceOptionTrades,
  parseBinanceOptionTradeMessage,
} from './binance-option-trades.ts';

function rawTrade(overrides: Record<string, unknown> = {}) {
  return {
    e: 'trade',
    E: 1_800_000_000_100,
    T: 1_800_000_000_000,
    s: 'BTC-261225-100000-C',
    t: 12345,
    p: '125.5',
    q: '2',
    X: 'MARKET',
    S: 'BUY',
    m: false,
    ...overrides,
  };
}

test('optionTrade classifies buyer-initiated flow from m=false', () => {
  const [event] = parseBinanceOptionTradeMessage(rawTrade(), { receivedAt: 1_800_000_000_200 });
  assert.ok(event);
  assert.equal(event.aggressorSide, 'BUY');
  assert.equal(event.signedQuantity, 2);
  assert.equal(event.tradeSide, 'BUY');
  assert.equal(event.buyerIsMaker, false);
  assert.equal(event.executionType, 'MARKET');
  assert.equal(event.receivedAt, 1_800_000_000_200);
  assert.equal(event.schemaVersion, 1);
});

test('optionTrade classifies seller-initiated flow from m=true even when S is BUY', () => {
  const [event] = parseBinanceOptionTradeMessage(rawTrade({ m: true, S: 'BUY' }));
  assert.ok(event);
  assert.equal(event.aggressorSide, 'SELL');
  assert.equal(event.signedQuantity, -2);
  assert.equal(event.tradeSide, 'BUY');
  assert.equal(event.buyerIsMaker, true);
});

test('combined stream envelope and JSON string payloads are supported', () => {
  const payload = JSON.stringify({ stream: 'btcusdt@optionTrade', data: rawTrade({ t: '12346' }) });
  const [event] = parseBinanceOptionTradeMessage(payload, { receivedAt: 1_800_000_000_300 });
  assert.ok(event);
  assert.equal(event.tradeId, '12346');
  assert.equal(event.symbol, 'BTC-261225-100000-C');
});

test('BLOCK trades are parsed but remain a distinct execution type', () => {
  const [event] = parseBinanceOptionTradeMessage(rawTrade({ X: 'BLOCK', m: true }));
  assert.ok(event);
  assert.equal(event.executionType, 'BLOCK');
  assert.equal(event.aggressorSide, 'SELL');
});

test('invalid, incomplete, non-finite and unsupported events are rejected', () => {
  assert.deepEqual(parseBinanceOptionTradeMessage('{bad json'), []);
  assert.deepEqual(parseBinanceOptionTradeMessage(null), []);
  assert.deepEqual(parseBinanceOptionTradeMessage(rawTrade({ e: '24hrTicker' })), []);
  assert.deepEqual(parseBinanceOptionTradeMessage(rawTrade({ m: 'false' })), []);
  assert.deepEqual(parseBinanceOptionTradeMessage(rawTrade({ X: 'UNKNOWN' })), []);
  assert.deepEqual(parseBinanceOptionTradeMessage(rawTrade({ S: 'HOLD' })), []);
  assert.deepEqual(parseBinanceOptionTradeMessage(rawTrade({ p: 'NaN' })), []);
  assert.deepEqual(parseBinanceOptionTradeMessage(rawTrade({ q: 0 })), []);
  assert.deepEqual(parseBinanceOptionTradeMessage(rawTrade({ T: 0 })), []);
  assert.deepEqual(parseBinanceOptionTradeMessage(rawTrade({ t: -1 })), []);
});

test('deduplication uses venue, symbol and trade ID without collapsing different symbols', () => {
  const first = parseBinanceOptionTradeMessage(rawTrade({ t: 77 }))[0];
  const duplicate = parseBinanceOptionTradeMessage(rawTrade({ t: 77, p: '126' }))[0];
  const otherSymbol = parseBinanceOptionTradeMessage(rawTrade({ t: 77, s: 'ETH-261225-4000-C' }))[0];
  assert.ok(first && duplicate && otherSymbol);
  const result = deduplicateBinanceOptionTrades([first, duplicate, otherSymbol]);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].price, 125.5);
});

test('flow aggregates keep MARKET and BLOCK separate and disclose raw quantity units', () => {
  const events = [
    ...parseBinanceOptionTradeMessage(rawTrade({ t: 1, q: '2' })),
    ...parseBinanceOptionTradeMessage(rawTrade({ t: 2, q: '3', m: true })),
    ...parseBinanceOptionTradeMessage(rawTrade({ t: 3, q: '5', X: 'BLOCK' })),
  ];
  const aggregates = aggregateBinanceOptionTradeFlow(events);
  assert.equal(aggregates.length, 2);
  const market = aggregates.find((item) => item.executionType === 'MARKET');
  const block = aggregates.find((item) => item.executionType === 'BLOCK');
  assert.ok(market && block);
  assert.equal(market.tradeCount, 2);
  assert.equal(market.buyerAggressorQuantity, 2);
  assert.equal(market.sellerAggressorQuantity, 3);
  assert.equal(market.signedAggressorQuantity, -1);
  assert.equal(block.tradeCount, 1);
  assert.equal(block.signedAggressorQuantity, 5);
  assert.equal(market.quantityUnit, 'VENUE_REPORTED_UNNORMALIZED');
  assert.equal(market.classification, 'OBSERVED_TAKER_SIDE_PROXY');
});
