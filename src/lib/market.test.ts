import assert from 'node:assert/strict';
import test from 'node:test';
import type { OptionQuote } from './types.ts';
import { getLatestQuotePerContract, getMarketSnapshotFromQuotes } from './market.ts';

function quote(overrides: Partial<OptionQuote> = {}): OptionQuote {
  return {
    id: 'BTC-261230-100-C',
    symbol: 'BTC-261230-100-C',
    underlying: 'BTC',
    quoteAsset: 'USD',
    expiry: '2026-12-30T08:00:00.000Z',
    daysToExpiry: 30,
    strike: 100,
    type: 'CALL',
    bid: 4.9,
    ask: 5.1,
    markPrice: 5,
    iv: 0.4,
    delta: 0.5,
    gamma: 0.01,
    theta: -0.1,
    vega: 0.2,
    rho: 0.03,
    openInterest: 10,
    volume: 4,
    spot: 100,
    unit: 1,
    ...overrides,
  };
}

test('snapshot aggregations keep only the latest timestamped observation per contract', () => {
  const older = quote({ sourceTimestamp: '2026-11-23T10:00:00.000Z', openInterest: 10 });
  const newer = quote({ id: `${older.id}#2`, sourceTimestamp: '2026-11-23T10:01:00.000Z', openInterest: 20 });
  const other = quote({ id: 'BTC-261230-100-P', symbol: 'BTC-261230-100-P', type: 'PUT' });
  const latest = getLatestQuotePerContract([older, other, newer]);

  assert.equal(latest.length, 2);
  assert.equal(latest[0].openInterest, 20);
  assert.equal(latest[1].type, 'PUT');
});

test('untimestamped duplicate rows do not get summed as separate contracts', () => {
  const rows = [quote({ openInterest: 10 }), quote({ id: 'duplicate', openInterest: 30 })];
  const latest = getLatestQuotePerContract(rows);

  assert.equal(latest.length, 1);
  assert.equal(latest[0].openInterest, 30);
});

test('30-day IV aggregation excludes fields explicitly marked as estimated', () => {
  const inferred = quote({
    id: 'model-iv', symbol: 'model-iv', iv: 0.8, estimatedFields: ['iv'],
  });
  const unmarkedIv = quote({
    id: 'unmarked-iv', symbol: 'unmarked-iv', strike: 110, type: 'PUT', iv: 0.4,
  });

  assert.equal(getMarketSnapshotFromQuotes([inferred, unmarkedIv], 'BTC')?.iv30, 0.4);
  assert.equal(getMarketSnapshotFromQuotes([inferred], 'BTC')?.iv30, null);
  assert.equal(getMarketSnapshotFromQuotes([quote({ estimatedFields: ['daysToExpiry'] })], 'BTC')?.iv30, null);
});

test('market totals use direct quote turnover when present and option premium for fallback estimates', () => {
  const estimated = quote({
    openInterest: 10,
    openInterestUsd: null,
    volume: 5,
    volumeQuote: null,
    spot: 100,
    bid: 1.9,
    ask: 2.1,
    markPrice: 2,
  });
  const direct = quote({
    id: 'BTC-261230-110-C',
    symbol: 'BTC-261230-110-C',
    strike: 110,
    openInterest: 2,
    openInterestUsd: 500,
    volume: 1,
    volumeQuote: 50,
    spot: 100,
    markPrice: 3,
  });
  const snapshot = getMarketSnapshotFromQuotes([estimated, direct], 'BTC');

  assert.equal(snapshot?.openInterestUsd, 1500);
  assert.equal(snapshot?.openInterestCurrency, 'USD');
  assert.equal(snapshot?.volume24hUsd, 60);
  assert.equal(snapshot?.volume24hCurrency, 'USD');
  assert.equal(snapshot?.openInterestUsdEstimated, true);
  assert.equal(snapshot?.volume24hUsdEstimated, true);
});

test('market totals are withheld instead of adding values from different quote currencies', () => {
  const usd = quote({ id: 'usd', symbol: 'usd', quoteAsset: 'USD', openInterestUsd: null, openInterest: 10, volumeQuote: null, volume: 5 });
  const eur = quote({ id: 'eur', symbol: 'eur', quoteAsset: 'EUR', openInterestUsd: null, openInterest: 20, volumeQuote: null, volume: 3 });
  const snapshot = getMarketSnapshotFromQuotes([usd, eur], 'BTC');

  assert.equal(snapshot?.openInterestUsd, null);
  assert.equal(snapshot?.openInterestCurrency, undefined);
  assert.equal(snapshot?.volume24hUsd, null);
  assert.equal(snapshot?.volume24hCurrency, undefined);
});

test('direct USD open interest is not mixed with a quote-currency estimate', () => {
  const directUsd = quote({ id: 'direct', symbol: 'direct', quoteAsset: 'EUR', openInterestUsd: 500, openInterest: 1, volumeQuote: 10, volume: 1 });
  const estimatedEur = quote({ id: 'estimated', symbol: 'estimated', quoteAsset: 'EUR', openInterestUsd: null, openInterest: 2, volumeQuote: null, volume: 1 });
  const snapshot = getMarketSnapshotFromQuotes([directUsd, estimatedEur], 'BTC');

  assert.equal(snapshot?.openInterestUsd, null);
  assert.equal(snapshot?.openInterestCurrency, undefined);
  assert.equal(snapshot?.volume24hUsd, 15);
  assert.equal(snapshot?.volume24hCurrency, 'EUR');
});

test('fallback totals remain unavailable when the quote currency is unknown', () => {
  const unknown = quote({ venue: 'CBOE', quoteAsset: undefined, openInterestUsd: null, openInterest: 10, volumeQuote: null, volume: 5 });
  const snapshot = getMarketSnapshotFromQuotes([unknown], 'BTC');

  assert.equal(snapshot?.openInterestUsd, null);
  assert.equal(snapshot?.volume24hUsd, null);
});
