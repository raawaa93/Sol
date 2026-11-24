import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetSnapshot, OptionQuote, OptionSide } from './types.ts';
import { getAtmTermStructure, getComparableDeltaSkew, getIvRvSpread, getReviewCandidates, getTermStructureContext } from './analysis.ts';

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
    underlyingKind: 'SPOT', exerciseStyle: 'EUROPEAN', settlementStyle: 'CASH', carryYield: 0, riskFreeRate: 0.05,
    pricingStatus: 'SUPPORTED', pricingModel: 'BLACK_SCHOLES_CARRY',
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

test('volatility surfaces exclude fields explicitly marked as estimated', () => {
  const unmarkedCall = option('CALL', { iv: 0.48, delta: 0.27 });
  const unmarkedPut = option('PUT', { iv: 0.6, delta: -0.23 });
  assert.ok(getComparableDeltaSkew([unmarkedCall, unmarkedPut]));
  assert.equal(getComparableDeltaSkew([
    { ...unmarkedCall, estimatedFields: ['iv'] }, unmarkedPut,
  ]), null);
  assert.equal(getComparableDeltaSkew([
    { ...unmarkedCall, estimatedFields: ['delta'] }, unmarkedPut,
  ]), null);
  assert.equal(getComparableDeltaSkew([
    { ...unmarkedCall, estimatedFields: ['daysToExpiry'] }, unmarkedPut,
  ]), null);
  assert.deepEqual(getAtmTermStructure([quote({ estimatedFields: ['iv'] })]), []);
  assert.deepEqual(getAtmTermStructure([
    quote({ id: 'estimated-expiry', symbol: 'estimated-expiry', strike: 105, estimatedFields: ['daysToExpiry'] }),
  ]), []);
});

test('volatility comparisons ignore non-finite expiry and spot inputs', () => {
  const call = option('CALL', { daysToExpiry: Number.POSITIVE_INFINITY });
  const put = option('PUT', { daysToExpiry: Number.POSITIVE_INFINITY });

  assert.equal(getComparableDeltaSkew([call, put]), null);
  assert.deepEqual(getAtmTermStructure([quote({ daysToExpiry: Number.POSITIVE_INFINITY })]), []);
  assert.deepEqual(getAtmTermStructure([quote({ spot: Number.POSITIVE_INFINITY })]), []);
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

test('observed-only contracts are excluded from delta skew and ranked opportunities', () => {
  const unsupportedCall = option('CALL', { pricingStatus: 'OBSERVED_ONLY', delta: 0.3 });
  const supportedPut = option('PUT', { pricingStatus: 'SUPPORTED', delta: -0.3 });
  assert.equal(getComparableDeltaSkew([unsupportedCall, supportedPut]), null);
  assert.equal(getReviewCandidates([unsupportedCall], 1).length, 0);
});

test('review candidate delta preferences ignore model-derived deltas', () => {
  const modelAtm = option('CALL', {
    id: 'model-atm', symbol: 'model-atm', bid: 9, ask: 11, delta: 0.5,
    estimatedFields: ['delta'],
  });
  const unmarkedWideDelta = option('CALL', {
    id: 'unmarked-wide-delta', symbol: 'unmarked-wide-delta', bid: 9.9, ask: 10.1, delta: 0.8,
  });

  assert.equal(getReviewCandidates([modelAtm, unmarkedWideDelta], 1)[0].id, 'unmarked-wide-delta');
});

test('review candidates keep a two-sided watchlist when one side has only a model-derived delta', () => {
  const call = option('CALL', { id: 'unmarked-call', symbol: 'unmarked-call', bid: 9.95, ask: 10.05, delta: 0.5 });
  const put = option('PUT', {
    id: 'estimated-put', symbol: 'estimated-put', bid: 9.9, ask: 10.1, delta: -0.5,
    estimatedFields: ['delta'],
  });
  const candidates = getReviewCandidates([call, put], 2);

  assert.deepEqual(candidates.map((candidate) => candidate.type).sort(), ['CALL', 'PUT']);
  assert.equal(candidates.find((candidate) => candidate.type === 'PUT')?.id, 'estimated-put');
});

test('review candidates prefer tight two-sided quotes and include both option sides when possible', () => {
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
