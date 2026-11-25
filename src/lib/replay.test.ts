import assert from 'node:assert/strict';
import test from 'node:test';
import { replayLongOptionSnapshots } from './replay.ts';
import { BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS } from './contract-economics.ts';
import type { OptionQuote } from './types.ts';

function quote(timestamp: string, overrides: Partial<OptionQuote> = {}): OptionQuote {
  return {
    id: 'BTC-261124-4000-C',
    symbol: 'BTC-261124-4000-C',
    underlying: 'BTC',
    assetClass: 'CRYPTO',
    venue: 'TEST-CRYPTO-VENUE',
    underlyingKind: 'SPOT',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'CASH',
    quoteAsset: 'USDT',
    settlementAsset: 'USDT',
    expiry: '2026-11-25T21:00:00.000Z',
    daysToExpiry: 1,
    strike: 4000,
    type: 'CALL',
    bid: 9,
    ask: 10,
    markPrice: 9.5,
    iv: 0.3,
    delta: 0.5,
    gamma: 0.01,
    theta: -0.1,
    vega: 0.2,
    rho: 0,
    openInterest: 100,
    volume: 10,
    spot: 4000,
    unit: 1,
    contractMultiplier: 1,
    bidAskSource: 'BOOK_TICKER',
    bidAskSizeUnit: 'CONTRACTS',
    bidQuantity: 100,
    askQuantity: 100,
    sourceTimestamp: timestamp,
    sourceTimestamps: timestamp ? { bookTicker: timestamp } : {},
    sourceReceivedAt: timestamp ? { bidAsk: timestamp } : {},
    ...overrides,
  };
}

const config = {
  holdingPeriodMs: 60 * 60_000,
  maxExitDelayMs: 10 * 60_000,
  maxSpreadPct: 20,
  feeRatePerSide: 0,
  quantity: 1,
  asOfTimestamp: '2026-11-25T07:00:00.000Z',
};

test('replay buys at ask and exits at bid after the configured hold period', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', { ask: 10, bid: 9 }),
    quote('2026-11-24T10:30:00.000Z', { ask: 12, bid: 11 }),
    quote('2026-11-24T11:02:00.000Z', { ask: 14, bid: 13 }),
  ], config);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].entryAsk, 10);
  assert.equal(result.trades[0].exitBid, 13);
  assert.equal(result.trades[0].netPnl, 3);
  assert.equal(result.trades[0].holdingMs, 62 * 60_000);
  assert.equal(result.trades[0].entryBidAskSource, 'BOOK_TICKER');
  assert.equal(result.trades[0].exitBidAskSource, 'BOOK_TICKER');
  assert.equal(result.trades[0].entrySourceTimestamp, '2026-11-24T10:00:00.000Z');
  assert.equal(result.trades[0].exitSourceTimestamp, '2026-11-24T11:02:00.000Z');
  assert.equal(result.trades[0].entryDisplayedSize, 100);
  assert.equal(result.trades[0].exitDisplayedSize, 100);
  assert.equal(result.trades[0].bidAskSizeUnit, 'CONTRACTS');
  assert.equal(result.winRate, 1);
});

test('replay applies per-side premium fees and never uses mark price for execution', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', { bid: 9, ask: 10, markPrice: 100 }),
    quote('2026-11-24T11:00:00.000Z', { bid: 12, ask: 13, markPrice: 1 }),
  ], { ...config, feeRatePerSide: 0.001 });
  assert.equal(result.trades.length, 1);
  assert.ok(Math.abs(result.trades[0].grossPnl - 2) < 1e-12);
  assert.ok(Math.abs(result.trades[0].fees - 0.022) < 1e-12);
  assert.ok(Math.abs(result.trades[0].netPnl - 1.978) < 1e-12);
});

test('replay refuses missing timestamps, invalid units, mismatched contract scales, crossed books and wide spreads', () => {
  const result = replayLongOptionSnapshots([
    quote('', { sourceTimestamp: undefined }),
    quote('2026-11-24T10:00:00.000Z', { unit: 0 }),
    quote('2026-11-24T10:00:00.000Z', { contractMultiplier: 100 }),
    quote('2026-11-24T10:00:00.000Z', { bid: 11, ask: 10 }),
    quote('2026-11-24T10:00:00.000Z', { bid: 1, ask: 20 }),
    quote('2026-11-24T11:00:00.000Z'),
  ], { ...config, maxSpreadPct: 20 });
  assert.equal(result.skipped.missingTimestamp, 1);
  assert.equal(result.skipped.invalidUnit, 1);
  assert.equal(result.skipped.invalidContractScale, 1);
  assert.equal(result.skipped.invalidQuote, 1);
  assert.equal(result.skipped.wideSpread, 1);
  assert.equal(result.trades.length, 0);
});


test('legacy replay blocks canonical contract terms instead of falling back to unit', () => {
  const economics = {
    premium: { multiplier: 1, quoteCurrency: 'USDT', priceUnit: 'PER_CONTRACT' as const },
    exercise: {
      style: 'EUROPEAN' as const,
      settlement: 'CASH' as const,
      settlementCurrency: 'USDT',
      deliverables: [],
      cashSettlement: { formula: 'INTRINSIC_VALUE' as const, reference: 'SPOT' as const, currency: 'USDT', multiplier: 100 },
    },
    provenance: {
      status: 'PROVIDER_VERIFIED' as const,
      provider: 'BINANCE',
      sourceRef: 'https://eapi.binance.com/eapi/v1/exchangeInfo',
      retrievedAt: '2026-11-24T10:00:00Z',
      rawFields: { unit: 100, underlyingType: 'CRYPTO', contractType: 'CRYPTO_OPTIONS' },
      legalTerms: { ...BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS },
    },
  };
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', { contractEconomics: economics }),
    quote('2026-11-24T11:00:00.000Z', { contractEconomics: economics }),
  ], config);
  assert.equal(result.trades.length, 0);
  assert.equal(result.skipped.invalidContractScale, 2);
});

test('CSV replay rejects a user-supplied DEMO venue label as source provenance', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', { venue: 'DEMO' }),
    quote('2026-11-24T11:00:00.000Z', { venue: 'DEMO' }),
  ], config);
  assert.equal(result.trades.length, 0);
  assert.equal(result.skipped.invalidContractScale, 2);
});

test('CSV replay rejects American physical equity even with matching numeric scales', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', {
      venue: 'CBOE', assetClass: 'EQUITY', underlyingKind: 'SPOT',
      exerciseStyle: 'AMERICAN', settlementStyle: 'PHYSICAL',
    }),
    quote('2026-11-24T11:00:00.000Z', {
      venue: 'CBOE', assetClass: 'EQUITY', underlyingKind: 'SPOT',
      exerciseStyle: 'AMERICAN', settlementStyle: 'PHYSICAL',
    }),
  ], config);
  assert.equal(result.trades.length, 0);
  assert.equal(result.skipped.invalidContractScale, 2);
});


test('replay skips a trade when contract scale or settlement currency changes between entry and exit', () => {
  const unitChanged = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', { unit: 1, contractMultiplier: 1 }),
    quote('2026-11-24T11:00:00.000Z', { unit: 2, contractMultiplier: 2 }),
  ], config);
  assert.equal(unitChanged.trades.length, 0);
  assert.equal(unitChanged.skipped.invalidContractScale, 1);

  const currencyChanged = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', { quoteAsset: 'USDT', settlementAsset: 'USDT' }),
    quote('2026-11-24T11:00:00.000Z', { quoteAsset: 'USDC', settlementAsset: 'USDC' }),
  ], config);
  assert.equal(currencyChanged.trades.length, 0);
  assert.equal(currencyChanged.skipped.invalidContractScale, 1);
});

test('replay does not look ahead beyond the exit grace window and avoids overlapping trades', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z'),
    quote('2026-11-24T11:30:00.000Z'),
    quote('2026-11-24T12:00:00.000Z'),
    quote('2026-11-24T13:00:00.000Z', { bid: 11, ask: 12 }),
    quote('2026-11-24T14:00:00.000Z', { bid: 12, ask: 13 }),
  ], { ...config, maxExitDelayMs: 5 * 60_000 });
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].exitTimestamp, '2026-11-24T13:00:00.000Z');
  assert.ok(result.trades[0].netPnl > 0);
});

test('replay returns no statistical metrics for invalid configuration or empty history', () => {
  const invalid = replayLongOptionSnapshots([], { ...config, holdingPeriodMs: 0 });
  assert.equal(invalid.winRate, null);
  assert.equal(invalid.returnOnPremiumPct, null);
  const empty = replayLongOptionSnapshots([], config);
  assert.equal(empty.trades.length, 0);
  assert.equal(empty.profitFactor, null);
});


test('portfolio drawdown follows source-time order across different option symbols', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:30:00.000Z', { symbol: 'B', id: 'B', ask: 10, bid: 9 }),
    quote('2026-11-24T11:30:00.000Z', { symbol: 'B', id: 'B', ask: 21, bid: 20 }),
    quote('2026-11-24T10:00:00.000Z', { symbol: 'A', id: 'A', ask: 10, bid: 9 }),
    quote('2026-11-24T11:00:00.000Z', { symbol: 'A', id: 'A', ask: 6, bid: 5 }),
    quote('2026-11-24T12:00:00.000Z', { symbol: 'C', id: 'C', ask: 10, bid: 9 }),
    quote('2026-11-24T13:00:00.000Z', { symbol: 'C', id: 'C', ask: 2.1, bid: 2 }),
  ], config);
  assert.deepEqual(result.trades.map((trade) => trade.symbol), ['A', 'B', 'C']);
  assert.equal(result.maxDrawdown, 8);
});

test('replay never treats the legacy last-trade timestamp as a bid/ask quote timestamp', () => {
  const result = replayLongOptionSnapshots([
    quote('', { sourceTimestamp: '2026-11-24T10:00:00.000Z' }),
    quote('2026-11-24T11:00:00.000Z'),
  ], config);
  assert.equal(result.trades.length, 0);
  assert.equal(result.skipped.missingTimestamp, 1);
});

test('replay requires a valid BBO source, receive clock and non-estimated execution prices', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', { bidAskSource: 'MARK_PRICE' }),
    quote('2026-11-24T10:00:00.000Z', { estimatedFields: ['bid'] }),
    quote('2026-11-24T10:00:00.000Z', { sourceReceivedAt: {} }),
    quote('2026-11-24T11:00:00.000Z'),
  ], config);
  assert.equal(result.trades.length, 0);
  assert.equal(result.skipped.invalidBidAskSource, 1);
  assert.equal(result.skipped.estimatedExecutionPrice, 1);
  assert.equal(result.skipped.missingTimestamp, 1);
});

test('replay requires explicit displayed size units and enough size at both entry and exit', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', { bidAskSizeUnit: undefined }),
    quote('2026-11-24T10:30:00.000Z', { askQuantity: 0.5 }),
    quote('2026-11-24T11:30:00.000Z'),
  ], config);
  console.log('DEBUG replay displayed-size counters', result.skipped);
  assert.equal(result.trades.length, 0);
  assert.equal(result.skipped.invalidSizeUnit, 1);
  assert.equal(result.skipped.insufficientDisplayedSize, 1);

  const insufficientExit = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z'),
    quote('2026-11-24T11:00:00.000Z', { bidQuantity: 0.5 }),
  ], config);
  assert.equal(insufficientExit.trades.length, 0);
  assert.equal(insufficientExit.skipped.insufficientDisplayedSize, 1);
});

test('replay applies adverse per-side slippage to ask entry and bid exit', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', { ask: 10, bid: 9 }),
    quote('2026-11-24T11:00:00.000Z', { ask: 13, bid: 12 }),
  ], { ...config, slippageBpsPerSide: 100 });
  assert.equal(result.trades.length, 1);
  assert.ok(Math.abs(result.trades[0].entryFill - 10.1) < 1e-12);
  assert.ok(Math.abs(result.trades[0].exitFill - 11.88) < 1e-12);
  assert.ok(Math.abs(result.trades[0].slippageCost - 0.22) < 1e-12);
  assert.ok(Math.abs(result.trades[0].grossPnl - 1.78) < 1e-12);
});

test('underlying-unit displayed size is compared against contracts times contract unit', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.000Z', { bidAskSizeUnit: 'UNDERLYING_UNITS', askQuantity: 1.5 }),
    quote('2026-11-24T11:00:00.000Z', { bidAskSizeUnit: 'UNDERLYING_UNITS' }),
  ], { ...config, quantity: 2 });
  console.log('DEBUG replay underlying-size counters', result.skipped);
  assert.equal(result.trades.length, 0);
  assert.equal(result.skipped.insufficientDisplayedSize, 1);
});


test('OPTION_TICKER BBO provenance uses the REST ticker snapshot clock, not the optionTicker last-price clock', () => {
  const result = replayLongOptionSnapshots([
    quote('2026-11-24T10:00:00.100Z', {
      bidAskSource: 'OPTION_TICKER',
      sourceTimestamps: { ticker: '2026-11-24T10:00:00.000Z', optionTicker: '2026-11-24T08:00:00.000Z' },
      sourceReceivedAt: { bidAsk: '2026-11-24T10:00:00.100Z' },
    }),
    quote('2026-11-24T11:00:00.100Z', {
      bidAskSource: 'OPTION_TICKER',
      sourceTimestamps: { ticker: '2026-11-24T11:00:00.000Z', optionTicker: '2026-11-24T08:00:00.000Z' },
      sourceReceivedAt: { bidAsk: '2026-11-24T11:00:00.100Z' },
    }),
  ], config);
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].entrySourceTimestamp, '2026-11-24T10:00:00.000Z');
  assert.equal(result.trades[0].exitSourceTimestamp, '2026-11-24T11:00:00.000Z');
});
