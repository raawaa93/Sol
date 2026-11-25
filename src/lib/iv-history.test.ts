import assert from 'node:assert/strict';
import test from 'node:test';
import type { OptionQuote } from './types.ts';
import {
  computeIVRankPercentile,
  extractObservedAtm30DayIV,
  selectDailyIVObservations,
  type IVHistoryObservation,
} from './iv-history.ts';

const AS_OF = '2026-11-25T07:00:00.000Z';

function observation(day: number, iv: number, overrides: Partial<IVHistoryObservation> = {}): IVHistoryObservation {
  const capturedAt = new Date(Date.parse(AS_OF) - day * 86_400_000).toISOString();
  return {
    schemaVersion: 1,
    id: 'binance-BTC-' + capturedAt,
    underlying: 'BTC',
    venue: 'BINANCE',
    convention: 'ATM_30D_VARIANCE_INTERPOLATED',
    iv,
    tenorDays: 30,
    capturedAt,
    receivedAt: capturedAt,
    source: 'BINANCE_REST_MARK',
    sourceRef: 'https://eapi.binance.com/eapi/v1/mark',
    contractCount: 2,
    expiryCount: 2,
    ...overrides,
  };
}

function quote(type: 'CALL' | 'PUT', expiry: string, daysToExpiry: number, iv: number, overrides: Partial<OptionQuote> = {}): OptionQuote {
  return {
    id: expiry + '-' + type,
    symbol: expiry + '-' + type,
    underlying: 'BTC',
    venue: 'BINANCE',
    expiry,
    daysToExpiry,
    strike: 100,
    type,
    bid: 4.9,
    ask: 5.1,
    markPrice: 5,
    iv,
    ivStatus: 'OBSERVED',
    markIvSource: 'REST_MARK',
    sourceReceivedAt: { markIv: '2026-11-25T06:59:00.000Z' },
    sourceTimestamps: { index: '2026-11-25T06:58:00.000Z' },
    delta: type === 'CALL' ? 0.5 : -0.5,
    gamma: 0.01,
    theta: -0.1,
    vega: 0.2,
    rho: 0.03,
    openInterest: 100,
    volume: 20,
    spot: 100,
    unit: 1,
    pricingStatus: 'SUPPORTED',
    underlyingKind: 'SPOT',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'CASH',
    carryYield: 0,
    riskFreeRate: 0.05,
    ...overrides,
  } as OptionQuote;
}

test('computes IV Rank and IV Percentile from 30 distinct daily observations', () => {
  const history = Array.from({ length: 29 }, (_, index) => observation(index + 1, 0.2 + index * 0.01));
  const current = observation(0, 0.35);
  const result = computeIVRankPercentile(history, current, AS_OF);

  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.sampleCount, 30);
  assert.ok(Math.abs((result.rank ?? 0) - ((0.35 - 0.2) / (0.48 - 0.2)) * 100) < 1e-9);
  assert.equal(result.percentile, 50);
  assert.equal(result.minimumIV, 0.2);
  assert.ok(Math.abs((result.maximumIV ?? 0) - 0.48) < 1e-12);
  assert.equal(result.isPartialHistory, true);
});

test('returns insufficient history instead of zero when fewer than 30 daily samples exist', () => {
  const history = Array.from({ length: 28 }, (_, index) => observation(index + 1, 0.2 + index * 0.01));
  const result = computeIVRankPercentile(history, observation(0, 0.4), AS_OF);
  assert.equal(result.status, 'INSUFFICIENT_HISTORY');
  assert.equal(result.rank, null);
  assert.equal(result.percentile, null);
  assert.equal(result.sampleCount, 29);
});

test('flat IV history makes IV Rank undefined while percentile remains measurable', () => {
  const history = Array.from({ length: 29 }, (_, index) => observation(index + 1, 0.4));
  const result = computeIVRankPercentile(history, observation(0, 0.4), AS_OF);
  assert.equal(result.status, 'FLAT_RANGE');
  assert.equal(result.rank, null);
  assert.equal(result.percentile, 0);
});

test('history is isolated by underlying, venue and IV convention', () => {
  const history = Array.from({ length: 29 }, (_, index) => observation(index + 1, 0.2 + index * 0.01));
  history.push(observation(1, 4, { underlying: 'ETH' }));
  history.push(observation(1, 4, { venue: 'OTHER' }));
  history.push(observation(1, 4, { convention: 'BID_IV_30D' }));
  const result = computeIVRankPercentile(history, observation(0, 0.4), AS_OF);
  assert.equal(result.sampleCount, 30);
  assert.equal(result.status, 'AVAILABLE');
});

test('selects the latest observation per UTC day without counting repeated refreshes twice', () => {
  const first = observation(1, 0.3);
  const later = observation(1, 0.5, { id: 'later-same-day', capturedAt: '2026-11-24T23:59:00.000Z', receivedAt: '2026-11-24T23:59:00.000Z' });
  const selected = selectDailyIVObservations([first, later], AS_OF);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, 'later-same-day');
  assert.equal(selected[0].iv, 0.5);
});

test('future, invalid and wrong-source observations cannot contaminate the IV history', () => {
  const history = Array.from({ length: 29 }, (_, index) => observation(index + 1, 0.2 + index * 0.01));
  history.push(observation(1, 4.9, { capturedAt: '2026-11-26T00:00:00.000Z', receivedAt: '2026-11-26T00:00:00.000Z' }));
  history.push(observation(1, 4.8, { source: 'SYNTHETIC' as IVHistoryObservation['source'], id: 'synthetic' }));
  history.push(observation(1, Number.NaN, { id: 'nan' }));
  const result = computeIVRankPercentile(history, observation(0, 0.4), AS_OF);
  assert.equal(result.sampleCount, 30);
  assert.equal(result.maximumIV, 0.48);
});

test('rejects a stale or future current IV observation', () => {
  const stale = observation(0, 0.4, { capturedAt: '2026-11-25T06:00:00.000Z', receivedAt: '2026-11-25T06:00:00.000Z' });
  assert.equal(computeIVRankPercentile([], stale, AS_OF).status, 'STALE_CURRENT');
  const future = observation(0, 0.4, { capturedAt: '2026-11-25T08:00:00.000Z', receivedAt: '2026-11-25T08:00:00.000Z' });
  assert.equal(computeIVRankPercentile([], future, AS_OF).status, 'INVALID_CURRENT');
});

test('extracts a source-verified 30-day ATM IV by interpolating total variance', () => {
  const quotes = [
    quote('CALL', '2026-12-15T08:00:00.000Z', 20, 0.5),
    quote('PUT', '2026-12-15T08:00:00.000Z', 20, 0.5),
    quote('CALL', '2027-01-04T08:00:00.000Z', 40, 0.6),
    quote('PUT', '2027-01-04T08:00:00.000Z', 40, 0.6),
  ];
  const result = extractObservedAtm30DayIV(quotes, AS_OF);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const expected = Math.sqrt((0.5 * 0.5 * 20 + 0.6 * 0.6 * 40) / 2 / 30);
  assert.ok(Math.abs(result.observation.iv - expected) < 1e-12);
  assert.equal(result.observation.tenorDays, 30);
  assert.equal(result.observation.convention, 'ATM_30D_VARIANCE_INTERPOLATED');
  assert.equal(result.observation.source, 'BINANCE_REST_MARK');
});

test('does not use venue vo, estimated IV, stale mark IV or unpaired option wings', () => {
  const base = [
    quote('CALL', '2026-12-15T08:00:00.000Z', 20, 0.5),
    quote('PUT', '2026-12-15T08:00:00.000Z', 20, 0.5),
    quote('CALL', '2027-01-04T08:00:00.000Z', 40, 0.6),
    quote('PUT', '2027-01-04T08:00:00.000Z', 40, 0.6),
  ];
  assert.equal(extractObservedAtm30DayIV(base.map((item) => ({ ...item, markIvSource: undefined, venueVolatility: item.iv })), AS_OF).ok, false);
  assert.equal(extractObservedAtm30DayIV(base.map((item) => ({ ...item, ivStatus: 'ESTIMATED' })), AS_OF).ok, false);
  assert.equal(extractObservedAtm30DayIV(base.map((item) => ({ ...item, sourceReceivedAt: { markIv: '2026-11-25T06:00:00.000Z' } })), AS_OF).ok, false);
  assert.equal(extractObservedAtm30DayIV(base.slice(0, 3), AS_OF).ok, false);
});
