import assert from 'node:assert/strict';
import test from 'node:test';
import { blackScholes, estimateGreekPnl, getBreakeven, getExpiryPnl, getExpectedMove, getMaxLoss, getRiskNeutralExpiryMetrics, getSpreadPct, impliedVolatility, normalCdf } from './options.ts';
import type { OptionQuote } from './types';
import { priceOption } from './pricing-model.ts';
import { BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS } from './contract-economics.ts';

const call: OptionQuote = {
  id: 'BTC-test-C', symbol: 'BTC-test-C', underlying: 'BTC', expiry: '2026-12-30T08:00:00.000Z',
  daysToExpiry: 30, strike: 100, type: 'CALL', bid: 4.9, ask: 5.1, markPrice: 5,
  iv: 0.4, delta: 0.5, gamma: 0.01, theta: -0.1, vega: 0.2, rho: 0.03, openInterest: 10, volume: 4, spot: 100, unit: 1, venue: 'DEMO',
  underlyingKind: 'SPOT', exerciseStyle: 'EUROPEAN', settlementStyle: 'CASH', carryYield: 0, riskFreeRate: 0.05,
  pricingStatus: 'SUPPORTED', pricingModel: 'BLACK_SCHOLES_CARRY',
};

const put: OptionQuote = { ...call, id: 'BTC-test-P', symbol: 'BTC-test-P', type: 'PUT', delta: -0.5 };

test('ATM call/put prices are consistent when rates are zero', () => {
  const callValue = blackScholes(100, 100, 30, 0.2, 'CALL');
  const putValue = blackScholes(100, 100, 30, 0.2, 'PUT');
  assert.ok(callValue.price > 0);
  assert.ok(Math.abs(callValue.price - putValue.price) < 0.03);
  assert.ok(callValue.delta > 0.5);
  assert.ok(putValue.delta < -0.4);
});

test('normal CDF matches independent central and tail reference values', () => {
  const references: Array<[number, number]> = [
    [-12, 1.776482112077702e-33],
    [-8, 6.220960574271829e-16],
    [-5, 2.866515718791945e-7],
    [-2, 0.022750131948179195],
    [-1, 0.15865525393145707],
    [0, 0.5],
    [1, 0.8413447460685429],
    [2, 0.9772498680518208],
    [5, 0.9999997133484281],
    [8, 0.9999999999999993],
    [12, 1],
  ];
  for (const [value, expected] of references) {
    const tolerance = Math.max(1e-30, Math.abs(expected) * 2e-14);
    assert.ok(Math.abs(normalCdf(value) - expected) <= tolerance, `normalCdf(${value}) should match its reference value`);
  }
  assert.equal(normalCdf(Number.NEGATIVE_INFINITY), 0);
  assert.equal(normalCdf(Number.POSITIVE_INFINITY), 1);
  assert.ok(Number.isNaN(normalCdf(Number.NaN)));
});

test('Black–Scholes agrees with a one-year European reference vector', () => {
  const callValue = blackScholes(100, 100, 365, 0.2, 'CALL', 0.05);
  const putValue = blackScholes(100, 100, 365, 0.2, 'PUT', 0.05);

  assert.ok(Math.abs(callValue.price - 10.450583572185565) < 1e-11);
  assert.ok(Math.abs(putValue.price - 5.573526022256971) < 1e-11);
  assert.ok(Math.abs(callValue.delta - 0.6368306511756191) < 1e-7);
  assert.ok(Math.abs(putValue.delta + 0.3631693488243809) < 1e-7);
  assert.ok(Math.abs(callValue.gamma - 0.018762017345846895) < 1e-10);
  assert.ok(Math.abs(callValue.vegaPerVolPoint - 0.3752403469169379) < 1e-10);
  assert.ok(Math.abs(callValue.thetaPerDay + 0.01757267820941972) < 1e-9);
  assert.ok(Math.abs(putValue.thetaPerDay + 0.004542138147766099) < 1e-9);
});

test('Rho is priced per one-percentage-point rate move and has the expected call/put sign', () => {
  const callValue = blackScholes(100, 100, 365, 0.2, 'CALL', 0.05);
  const putValue = blackScholes(100, 100, 365, 0.2, 'PUT', 0.05);
  const callBump = (blackScholes(100, 100, 365, 0.2, 'CALL', 0.06).price
    - blackScholes(100, 100, 365, 0.2, 'CALL', 0.04).price) / 2;
  const putBump = (blackScholes(100, 100, 365, 0.2, 'PUT', 0.06).price
    - blackScholes(100, 100, 365, 0.2, 'PUT', 0.04).price) / 2;

  assert.ok(Math.abs(callValue.rhoPerRatePoint - callBump) < 1e-4);
  assert.ok(Math.abs(putValue.rhoPerRatePoint - putBump) < 1e-4);
  assert.ok(callValue.rhoPerRatePoint > 0);
  assert.ok(putValue.rhoPerRatePoint < 0);
  assert.equal(blackScholes(100, 100, 0, 0.2, 'CALL', 0.05).rhoPerRatePoint, 0);
});

test('implied volatility respects discounted European price bounds', () => {
  const putPrice = blackScholes(100, 120, 365, 0.3, 'PUT', 0.1).price;
  assert.ok(putPrice < 20, 'a positive rate can make a European put trade below immediate intrinsic value');
  const solvedPutIv = impliedVolatility(putPrice, 100, 120, 365, 'PUT', 0.1);
  assert.ok(solvedPutIv !== undefined);
  assert.ok(Math.abs((solvedPutIv ?? 0) - 0.3) < 1e-5);

  assert.equal(impliedVolatility(12, 100, 90, 365, 'CALL', 0.1), undefined,
    'a call price below S minus discounted strike is outside the no-arbitrage bounds');
});

test('expiry payoff is net of premium, quantity and fees', () => {
  assert.ok(Math.abs(getExpiryPnl(call, 120, 5, 0.1, 0.2) - 1.3) < 1e-8);
  assert.ok(Math.abs(getExpiryPnl(put, 80, 5, 0.1, 0.2) - 1.3) < 1e-8);
  assert.ok(Math.abs(getExpiryPnl(call, 80, 5, 0.1, 0.2) + 0.7) < 1e-8);
});

test('local Greek shock estimate applies delta, gamma, theta, vega, rho, quantity and unit', () => {
  const estimate = estimateGreekPnl(call, 2, {
    spotMovePercent: 2,
    volatilityMovePoints: 2,
    daysElapsed: 3,
    riskFreeRateMovePoints: 1,
  });
  assert.ok(Math.abs(estimate - 2.3) < 1e-12);
  assert.ok(Math.abs(estimateGreekPnl({ ...call, unit: 3 }, 2, { spotMovePercent: 2 }) - 6.12) < 1e-12);
});

test('breakeven and maximum loss include fees', () => {
  assert.ok(Math.abs(getBreakeven(call, 5, 0.2, 0.1) - 107) < 1e-8);
  assert.ok(Math.abs(getBreakeven(put, 5, 0.2, 0.1) - 93) < 1e-8);
  assert.ok(Math.abs(getMaxLoss(5, 0.1, 1, 0.2) - 0.7) < 1e-8);
});

test('expected move scales with implied volatility and square root of time', () => {
  assert.ok(Math.abs(getExpectedMove(100, 0.2, 365) - 20) < 1e-8);
  assert.equal(getExpectedMove(100, 0.2, 0), 0);
});

test('implied volatility solver recovers the model input', () => {
  const price = blackScholes(100, 105, 45, 0.62, 'CALL').price;
  const solved = impliedVolatility(price, 100, 105, 45, 'CALL');
  assert.ok(solved !== undefined);
  assert.ok(Math.abs((solved ?? 0) - 0.62) < 1e-5);
});

test('spread is unknown when either market side is absent', () => {
  assert.ok(Number.isNaN(getSpreadPct({ ...call, ask: 0 })));
});


test('risk-neutral expiry metrics reproduce the Black–Scholes discounted-payoff identity', () => {
  const priced = blackScholes(100, 100, 365, 0.2, 'CALL', 0.05);
  const metrics = getRiskNeutralExpiryMetrics({ ...call, spot: 100, strike: 100, daysToExpiry: 365, iv: 0.2 }, priced.price, 0.05, 'DEMO');
  assert.ok(metrics);
  assert.ok(Math.abs((metrics?.expectedIntrinsicPerUnit ?? 0) - priced.price * Math.exp(0.05)) < 1e-10);
  assert.ok(Math.abs(metrics?.modelValueGapPerUnit ?? 1) < 1e-10);
  assert.ok(metrics?.probabilityInTheMoney !== undefined && metrics.probabilityInTheMoney > 0.5);
});

test('risk-neutral futures-option metrics use Black-76 and the forward distribution', () => {
  const future = {
    ...call,
    underlyingKind: 'FUTURE' as const,
    forward: 100,
    spot: 97,
    daysToExpiry: 365,
    iv: 0.2,
    exerciseStyle: 'EUROPEAN' as const,
    settlementStyle: 'PHYSICAL' as const,
    carryYield: undefined,
    pricingModel: 'BLACK_76' as const,
  };
  const model = priceOption({
    underlyingKind: 'FUTURE',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'PHYSICAL',
    forward: 100,
    strike: 100,
    daysToExpiry: 365,
    volatility: 0.2,
    type: 'CALL',
    rate: 0.05,
  });
  assert.equal(model.status, 'SUPPORTED');
  if (model.status !== 'SUPPORTED') return;
  const metrics = getRiskNeutralExpiryMetrics(future, model.greeks.price, undefined, 'DEMO');
  assert.ok(metrics);
  assert.ok(Math.abs((metrics?.expectedIntrinsicPerUnit ?? 0) - model.greeks.price * Math.exp(0.05)) < 1e-10);
  assert.ok(Math.abs(metrics?.modelValueGapPerUnit ?? 1) < 1e-10);
});

test('risk-neutral expiry metrics reject observed-only and non-European contracts', () => {
  assert.equal(getRiskNeutralExpiryMetrics({ ...call, pricingStatus: 'OBSERVED_ONLY' }, 5, undefined, 'DEMO'), null);
  assert.equal(getRiskNeutralExpiryMetrics({ ...call, exerciseStyle: 'AMERICAN' }, 5, undefined, 'DEMO'), null);
});

test('risk-neutral probability of profit uses the paid premium and differs from probability ITM', () => {
  const quote = { ...call, spot: 100, strike: 100, daysToExpiry: 30, iv: 0.5 };
  const metrics = getRiskNeutralExpiryMetrics(quote, 5, undefined, 'DEMO');
  assert.ok(metrics);
  assert.ok((metrics?.probabilityOfProfit ?? 1) < (metrics?.probabilityInTheMoney ?? 0));
  assert.ok((metrics?.breakevenPrice ?? 0) > quote.strike);
  assert.ok((metrics?.expectedExpiryPnlPerUnit ?? 0) > 0);
});

test('risk-neutral put metrics handle impossible non-positive break-even and expiry', () => {
  const expensivePut = getRiskNeutralExpiryMetrics({ ...put, strike: 10, spot: 100, daysToExpiry: 30, iv: 0.5 }, 12, undefined, 'DEMO');
  assert.equal(expensivePut?.probabilityOfProfit, 0);

  const expired = getRiskNeutralExpiryMetrics({ ...call, spot: 110, strike: 100, daysToExpiry: 0 }, 5, undefined, 'DEMO');
  assert.equal(expired?.probabilityOfProfit, 1);
  assert.equal(expired?.expectedExpiryPnlPerUnit, 5);
  assert.equal(getRiskNeutralExpiryMetrics(call, -1, undefined, 'DEMO'), null);
  assert.equal(getRiskNeutralExpiryMetrics({ ...call, iv: 0 }, 5, undefined, 'DEMO'), null);
});


test('risk-neutral metrics reject canonical terms until a canonical probability model is available', () => {
  const canonicalBinance: OptionQuote = {
    ...call,
    venue: 'BINANCE',
    assetClass: 'CRYPTO',
    underlyingKind: 'SPOT',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'CASH',
    quoteAsset: 'USDT',
    settlementAsset: 'USDT',
    unit: 1,
    sourceTimestamps: { index: '2026-11-25T03:00:00Z' },
    contractEconomics: {
      premium: { multiplier: 1, quoteCurrency: 'USDT', priceUnit: 'PER_CONTRACT' },
      exercise: {
        style: 'EUROPEAN',
        settlement: 'CASH',
        settlementCurrency: 'USDT',
        deliverables: [],
        cashSettlement: { formula: 'INTRINSIC_VALUE', reference: 'INDEX', currency: 'USDT', multiplier: 1 },
      },
      provenance: {
        status: 'PROVIDER_VERIFIED',
        provider: 'BINANCE',
        sourceRef: 'https://eapi.binance.com/eapi/v1/exchangeInfo',
        retrievedAt: '2026-11-25T03:00:00Z',
        rawFields: { unit: 1, underlyingType: 'CRYPTO', contractType: 'CRYPTO_OPTIONS' },
        legalTerms: { ...BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS },
      },
    },
  };
  assert.equal(getRiskNeutralExpiryMetrics(canonicalBinance, 5, undefined, 'BINANCE'), null);
});

test('risk-neutral metrics enforce contract-scale guard for direct callers', () => {
  const binanceUnitOne: OptionQuote = {
    ...call,
    venue: 'BINANCE',
    assetClass: 'CRYPTO',
    underlyingKind: 'SPOT',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'CASH',
    quoteAsset: 'USDT',
    settlementAsset: 'USDT',
    unit: 1,
  };
  assert.ok(getRiskNeutralExpiryMetrics(binanceUnitOne, 5, undefined, 'BINANCE'));

  const binanceUnitHundred = { ...binanceUnitOne, unit: 100 };
  assert.equal(getRiskNeutralExpiryMetrics(binanceUnitHundred, 5, undefined, 'BINANCE'), null);
  assert.equal(getRiskNeutralExpiryMetrics({ ...binanceUnitOne, unit: 100, contractMultiplier: 100 }, 5, undefined, 'BINANCE'), null);
});
