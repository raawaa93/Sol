import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetSnapshot, OptionQuote, OptionSide } from './types.ts';
import { getComparableDeltaSkew, getIvRvSpread, getReviewCandidates, getTermStructureContext } from './analysis.ts';

function quote(overrides: Partial<OptionQuote> = {}): OptionQuote {
  return {
    id: 'BTC-261230-100-C',
    symbol: 'BTC-261230-100-C',
    underlying: 'BTC',
    expiry: '2026-12-23T08:00:00.000Z',
    daysToExpiry: 30,
    strike: 100,
    type: 'CALL',
    bid: 4.9,
    ask: 5.1,
    markPrice: 5,
    iv: 0.5,
    delta: 0.5,
    gamma: 0.01,
    theta: -0.1,
    vega: 0.2,
    rho: 0.03,
    openInterest: 100,
    volume: 20,
    spot: 100,
    unit: 1,
    ...overrides,
  };
}

function option(type: OptionSide, overrides: Partial<OptionQuote> = {}): OptionQuote {
  return quote({
    id: `BTC-261223-100-${type}`,
    symbol: `BTC-261223-100-${type}`,
    type,
    delta: type === 'CALL' ? 0.25 : -0.25,
    ...overrides,
  });
}

const market: AssetSnapshot = {
  underlying: 'BTC',
  spot: 100,
  dayChangePct: 0,
  iv30: 0.6,
  rv30: 0.5,
  openInterestUsd: null,
  volume24hUsd: null,
  fundingRate: 0,
};

test('IV minus realised volatility remains unavailable unless both 30-day inputs exist', () => {
  assert.ok(Math.abs((getIvRvSpread(market) ?? 0) - 0.1) < 1e-12);
  assert.equal(getIvRvSpread({ ...market, rv30: null }), null);
  assert.equal(getIvRvSpread(null), null);
});

test('25-delta skew compares same-expiry call and put wings with similar absolute delta', () => {
  const call = option('CALL', { iv: 0.48, delta: 0.27 });
  const put = option('PUT', { iv: 0.6, delta: -0.23 });
  const skew = getComparableDeltaSkew([call, put]);

  assert.ok(skew);
  assert.equal(skew?.callIv, 0.48);
  assert.equal(skew?.putIv, 0.6);
  assert.ok(Math.abs((skew?.putMinusCallIv ?? 0) - 0.12) < 1e-12);
  assert.equal(getComparableDeltaSkew([call]), null);
  assert.equal(getComparableDeltaSkew([call, put], 1), null);
});

test('ATM term structure uses nearest-to-ATM strikes and compares front, near and back expiries', () => {
  const rows = [
    quote({ id: 'front-c', symbol: 'front-c', expiry: '2026-12-07T08:00:00.000Z', daysToExpiry: 14, strike: 100, iv: 0.65 }),
    quote({ id: 'near-c', symbol: 'near-c', expiry: '2026-12-23T08:00:00.000Z', daysToExpiry: 30, strike: 100, iv: 0.55 }),
    quote({ id: 'near-p', symbol: 'near-p', expiry: '2026-12-23T08:00:00.000Z', daysToExpiry: 30, strike: 100, type: 'PUT', iv: 0.57 }),
    quote({ id: 'back-c', symbol: 'back-c', expiry: '2027-01-22T08:00:00.000Z', daysToExpiry: 60, strike: 100, iv: 0.48 }),
    quote({ id: 'far-otm', symbol: 'far-otm', expiry: '2026-12-23T08:00:00.000Z', daysToExpiry: 30, strike: 120, iv: 1.1 }),
  ];
  const context = getTermStructureContext(rows);

  assert.equal(context?.front?.daysToExpiry, 14);
  assert.equal(context?.near.daysToExpiry, 30);
  assert.ok(Math.abs((context?.near.iv ?? 0) - 0.56) < 1e-12);
  assert.equal(context?.back?.daysToExpiry, 60);
  assert.equal(getTermStructureContext([]), null);
});

test('review candidates prefer observed two-sided quotes and include both option sides when possible', () => {
  const narrowCall = option('CALL', {
    id: 'narrow-call', symbol: 'narrow-call', bid: 9.95, ask: 10.05, openInterest: 10,
  });
  const wideCall = option('CALL', {
    id: 'wide-call', symbol: 'wide-call', strike: 105, bid: 9, ask: 11, openInterest: 1000,
  });
  const put = option('PUT', { id: 'put', symbol: 'put', bid: 8.9, ask: 9.1 });
  const missingSide = option('PUT', { id: 'missing', symbol: 'missing', bid: 0, ask: 9.1, strike: 95 });
  const candidates = getReviewCandidates([wideCall, put, missingSide, narrowCall], 2);

  assert.equal(candidates.length, 2);
  assert.ok(candidates.some((candidate) => candidate.id === 'narrow-call'));
  assert.ok(candidates.some((candidate) => candidate.id === 'put'));
  assert.ok(!candidates.some((candidate) => candidate.id === 'missing'));
  assert.ok(getReviewCandidates([missingSide]).length === 0);
});
