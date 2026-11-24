import assert from 'node:assert/strict';
import test from 'node:test';
import { getQuoteDataCoverage } from './quote-data-coverage.ts';
import type { OptionQuote } from './types.ts';

function quote(overrides: Partial<OptionQuote> = {}): OptionQuote {
  return {
    id: 'BTC-TEST-C',
    symbol: 'BTC-TEST-C',
    underlying: 'BTC',
    expiry: '2026-12-31T08:00:00.000Z',
    daysToExpiry: 30,
    strike: 100000,
    type: 'CALL',
    bid: 9,
    ask: 11,
    markPrice: 10,
    iv: 0.5,
    delta: 0.5,
    gamma: 0,
    theta: 0,
    vega: 0,
    rho: 0,
    openInterest: 0,
    volume: 0,
    spot: 100000,
    unit: 1,
    ...overrides,
  };
}

test('quote coverage distinguishes observed, estimated, and unavailable fields', () => {
  const coverage = getQuoteDataCoverage([
    quote({ ivStatus: 'OBSERVED' }),
    quote({ id: 'estimated', ivStatus: 'ESTIMATED', estimatedFields: ['iv'] }),
    quote({ id: 'missing-iv', iv: 0, ivStatus: 'UNAVAILABLE', bid: 0, ask: 8, openInterest: null, volume: null }),
    quote({ id: 'crossed', bid: 12, ask: 10, bidIv: 0.5, askIv: 0.6, bidQuantity: 2, askQuantity: 3, bidAskSource: 'OPTION_TICKER', sourceTimestamps: { bookTicker: '2026-11-24T10:00:00.000Z', markPrice: '2026-11-24T10:00:00.000Z', ticker: '2026-11-24T10:00:00.000Z' } }),
  ]);

  assert.deepEqual(coverage, {
    contracts: 4,
    twoSidedQuotes: 2,
    oneSidedQuotes: 1,
    missingBothSides: 0,
    crossedQuotes: 1,
    observedIv: 2,
    estimatedIv: 1,
    unavailableIv: 1,
    openInterestAvailable: 3,
    volumeAvailable: 3,
    providerVerifiedEconomics: 0,
    bookTickerAvailable: 1,
    liveMarkPriceAvailable: 1,
    liveOptionTickerAvailable: 1,
    bestBookQuantitiesAvailable: 1,
    bidIvAvailable: 1,
    askIvAvailable: 1,
    optionTickerBookAvailable: 1,
  });
});

test('zero open interest and volume are valid observed values, not missing data', () => {
  const coverage = getQuoteDataCoverage([quote({ openInterest: 0, volume: 0 })]);
  assert.equal(coverage.openInterestAvailable, 1);
  assert.equal(coverage.volumeAvailable, 1);
});
