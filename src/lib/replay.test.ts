import assert from 'node:assert/strict';
import test from 'node:test';
import { replayLongOptionSnapshots } from './replay.ts';
import type { OptionQuote } from './types.ts';

function quote(timestamp: string, overrides: Partial<OptionQuote> = {}): OptionQuote {
  return {
    id: 'XAU-261124-4000-C',
    symbol: 'XAU-261124-4000-C',
    underlying: 'BTC',
    assetClass: 'CRYPTO',
    venue: 'BINANCE',
    underlyingKind: 'SPOT',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'CASH',
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
    sourceTimestamp: timestamp,
    ...overrides,
  };
}

const config = {
  holdingPeriodMs: 60 * 60_000,
  maxExitDelayMs: 10 * 60_000,
  maxSpreadPct: 20,
  feeRatePerSide: 0,
  quantity: 1,
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
