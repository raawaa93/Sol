import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateQuoteCashBreakeven,
  calculateQuoteCashExpiryPnl,
  calculateQuoteCashMaxLoss,
  calculateQuoteCashRiskNeutralMetrics,
} from './quote-economics.ts';
import type { OptionQuote } from './types.ts';

const baseQuote: OptionQuote = {
  id: 'CANONICAL-CALL',
  symbol: 'CANONICAL-CALL',
  underlying: 'INDEX-TEST',
  venue: 'TEST-PROVIDER',
  assetClass: 'INDEX',
  underlyingKind: 'SPOT',
  exerciseStyle: 'EUROPEAN',
  settlementStyle: 'CASH',
  quoteAsset: 'USD',
  settlementAsset: 'USD',
  expiry: '2026-12-31T00:00:00.000Z',
  daysToExpiry: 30,
  strike: 100,
  type: 'CALL',
  bid: 1.2,
  ask: 1.3,
  markPrice: 1.25,
  iv: 0.2,
  delta: 0.5,
  gamma: 0.01,
  theta: -0.1,
  vega: 0.2,
  rho: 0,
  openInterest: 10,
  volume: 5,
  spot: 100,
  unit: 1,
  contractEconomics: {
    premium: { multiplier: 10, quoteCurrency: 'USD', priceUnit: 'PER_UNDERLYING_UNIT' },
    exercise: {
      style: 'EUROPEAN',
      settlement: 'CASH',
      settlementCurrency: 'USD',
      deliverables: [],
      cashSettlement: { formula: 'INTRINSIC_VALUE', reference: 'SPOT', currency: 'USD', multiplier: 100 },
    },
    provenance: {
      status: 'PROVIDER_VERIFIED',
      provider: 'TEST-PROVIDER',
      sourceRef: 'contract-spec-123',
      retrievedAt: '2026-11-24T10:00:00Z',
    },
  },
};

test('canonical cash expiry uses settlement and premium multipliers independently', () => {
  const result = calculateQuoteCashExpiryPnl(baseQuote, {
    settlementReferencePrice: 120,
    premiumPrice: 1.25,
    contracts: 3,
    fees: 0.5,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.grossSettlement, 6000);
  assert.equal(result.value.premiumAmount, 37.5);
  assert.equal(result.value.netPnl, 5962);
  assert.equal(result.value.currency, 'USD');
});

test('canonical call and put break-even use the distinct settlement multiplier', () => {
  const call = calculateQuoteCashBreakeven(baseQuote, { premiumPrice: 1.25, contracts: 3, fees: 0.5 });
  assert.equal(call.ok, true);
  if (call.ok) assert.ok(Math.abs(call.value.price - 100.12666666666667) < 1e-10);

  const put = calculateQuoteCashBreakeven({ ...baseQuote, type: 'PUT' }, {
    premiumPrice: 1.25, contracts: 3, fees: 0.5,
  });
  assert.equal(put.ok, true);
  if (put.ok) assert.ok(Math.abs(put.value.price - 99.87333333333333) < 1e-10);
});

test('maximum loss uses premium multiplier, not settlement multiplier or legacy unit', () => {
  const result = calculateQuoteCashMaxLoss({ ...baseQuote, unit: 999 }, {
    premiumPrice: 1.25, contracts: 3, fees: 0.5,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.amount, 38);
    assert.equal(result.value.currency, 'USD');
  }
});

test('Binance crypto options use the verified Spot Price Index settlement reference and per-contract premium', () => {
  const binanceQuote: OptionQuote = {
    ...baseQuote,
    id: 'BTC-INDEX-CALL',
    symbol: 'BTC-INDEX-CALL',
    underlying: 'BTC',
    venue: 'BINANCE',
    assetClass: 'CRYPTO',
    underlyingKind: 'SPOT',
    quoteAsset: 'USDT',
    settlementAsset: 'USDT',
    unit: 100,
    sourceTimestamps: { index: '2026-11-24T10:00:00Z' },
    contractEconomics: {
      premium: { multiplier: 1, quoteCurrency: 'USDT', priceUnit: 'PER_CONTRACT' },
      exercise: {
        style: 'EUROPEAN',
        settlement: 'CASH',
        settlementCurrency: 'USDT',
        deliverables: [],
        cashSettlement: { formula: 'INTRINSIC_VALUE', reference: 'INDEX', currency: 'USDT', multiplier: 100 },
      },
      provenance: {
        status: 'PROVIDER_VERIFIED',
        provider: 'BINANCE',
        sourceRef: 'https://eapi.binance.com/eapi/v1/exchangeInfo',
        retrievedAt: '2026-11-24T10:00:00Z',
      },
    },
  };

  const breakeven = calculateQuoteCashBreakeven(binanceQuote, {
    premiumPrice: 1.25, contracts: 3, fees: 0.5,
  });
  assert.equal(breakeven.ok, true);
  if (breakeven.ok) assert.ok(Math.abs(breakeven.value.price - 100.01416666666667) < 1e-10);

  const maxLoss = calculateQuoteCashMaxLoss(binanceQuote, {
    premiumPrice: 1.25, contracts: 3, fees: 0.5,
  });
  assert.equal(maxLoss.ok, true);
  if (maxLoss.ok) {
    assert.equal(maxLoss.value.amount, 4.25);
    assert.equal(maxLoss.value.currency, 'USDT');
  }

  const expiry = calculateQuoteCashExpiryPnl(binanceQuote, {
    settlementReferencePrice: 120, premiumPrice: 1.25, contracts: 3, fees: 0.5,
  });
  assert.equal(expiry.ok, true);
  if (expiry.ok) {
    assert.equal(expiry.value.grossSettlement, 6000);
    assert.equal(expiry.value.premiumAmount, 3.75);
    assert.equal(expiry.value.netPnl, 5995.75);
  }
});

test('unknown provenance and physical delivery fail closed', () => {
  const unknown = {
    ...baseQuote,
    contractEconomics: {
      ...baseQuote.contractEconomics!,
      provenance: { status: 'UNKNOWN' as const },
    },
  };
  assert.equal(calculateQuoteCashExpiryPnl(unknown, {
    settlementReferencePrice: 120, premiumPrice: 1.25, contracts: 1,
  }).ok, false);

  const physical = {
    ...baseQuote,
    settlementStyle: 'PHYSICAL' as const,
    contractEconomics: {
      ...baseQuote.contractEconomics!,
      exercise: {
        style: 'EUROPEAN' as const,
        settlement: 'PHYSICAL' as const,
        settlementCurrency: 'USD',
        deliverables: [{ type: 'EQUITY' as const, symbol: 'XYZ', amount: 100, currency: 'USD' }],
        aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER' as const, currency: 'USD', multiplier: 100 },
      },
    },
  };
  assert.equal(calculateQuoteCashExpiryPnl(physical, {
    settlementReferencePrice: 120, premiumPrice: 1.25, contracts: 1,
  }).ok, false);
});

test('reference type mismatch is rejected instead of substituting spot or forward', () => {
  const result = calculateQuoteCashExpiryPnl({
    ...baseQuote,
    underlyingKind: 'FUTURE',
    forward: 120,
  }, { settlementReferencePrice: 120, premiumPrice: 1.25, contracts: 1 });
  assert.equal(result.ok, false);
});


test('canonical cash expiry scenarios use settlement multiplier and never legacy unit', async () => {
  const { buildQuoteCashExpiryScenarioSeries } = await import('./quote-economics.ts');
  const quote = { ...baseQuote, unit: 999 };
  const scenarios = buildQuoteCashExpiryScenarioSeries(quote, 1.25, 3, 0.5);
  assert.ok(scenarios);
  assert.equal(scenarios.length, 9);
  const flat = scenarios.find((point) => point.move === 0);
  assert.ok(flat);
  assert.equal(flat.pnl, -38);
  const upTwenty = scenarios.find((point) => point.move === 0.2);
  assert.ok(upTwenty);
  assert.equal(upTwenty.pnl, 5962);
});

test('canonical cash expiry scenarios fail closed for unverified or mismatched terms', async () => {
  const { buildQuoteCashExpiryScenarioSeries } = await import('./quote-economics.ts');
  const unverified = {
    ...baseQuote,
    contractEconomics: {
      ...baseQuote.contractEconomics!,
      provenance: { status: 'UNKNOWN' as const },
    },
  };
  assert.equal(buildQuoteCashExpiryScenarioSeries(unverified, 1.25, 1), null);
  assert.equal(buildQuoteCashExpiryScenarioSeries({
    ...baseQuote,
    underlyingKind: 'FUTURE',
    forward: 100,
  }, 1.25, 1), null);
});


function canonicalBinanceRiskQuote(overrides: Partial<OptionQuote> = {}): OptionQuote {
  return {
    ...baseQuote,
    id: 'BTC-INDEX-CALL',
    symbol: 'BTC-INDEX-CALL',
    underlying: 'BTC',
    venue: 'BINANCE',
    assetClass: 'CRYPTO',
    underlyingKind: 'SPOT',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'CASH',
    quoteAsset: 'USDT',
    settlementAsset: 'USDT',
    spot: 100,
    strike: 100,
    unit: 100,
    daysToExpiry: 365,
    iv: 0.2,
    ivStatus: 'OBSERVED',
    riskFreeRate: 0.05,
    carryYield: 0,
    pricingStatus: 'ASSUMED',
    pricingModel: 'BLACK_SCHOLES_CARRY',
    sourceTimestamps: { index: '2026-11-25T03:00:00.000Z', ticker: '2026-11-25T03:00:00.000Z' },
    contractEconomics: {
      premium: { multiplier: 1, quoteCurrency: 'USDT', priceUnit: 'PER_CONTRACT' },
      exercise: {
        style: 'EUROPEAN',
        settlement: 'CASH',
        settlementCurrency: 'USDT',
        deliverables: [],
        cashSettlement: { formula: 'INTRINSIC_VALUE', reference: 'INDEX', currency: 'USDT', multiplier: 100 },
      },
      provenance: {
        status: 'PROVIDER_VERIFIED',
        provider: 'BINANCE',
        sourceRef: 'https://eapi.binance.com/eapi/v1/exchangeInfo',
        retrievedAt: '2026-11-25T03:00:00.000Z',
      },
    },
    ...overrides,
  };
}

test('canonical Binance risk-neutral EV scales intrinsic value by settlement multiplier, not premium multiplier', () => {
  const quote = canonicalBinanceRiskQuote();
  const metrics = calculateQuoteCashRiskNeutralMetrics(quote, 900, 2);
  assert.ok(metrics);
  assert.equal(metrics?.currency, 'USDT');
  assert.ok((metrics?.probabilityInTheMoney ?? 0) > 0.5);
  assert.ok((metrics?.breakevenPrice ?? 0) > quote.strike);
  assert.ok((metrics?.modelPricePerContract ?? 0) > 0);
  assert.ok(Math.abs((metrics?.expectedExpiryPnlPerContract ?? 0)
    - ((metrics?.modelPricePerContract ?? 0) * Math.exp(quote.riskFreeRate! * (quote.daysToExpiry / 365)) - 900 - 2)) < 1e-8);
});

test('canonical put risk-neutral probability uses cash-settlement multiplier and fees in break-even', () => {
  const quote = canonicalBinanceRiskQuote({ type: 'PUT', strike: 110 });
  const metrics = calculateQuoteCashRiskNeutralMetrics(quote, 900, 3);
  assert.ok(metrics);
  assert.ok((metrics?.breakevenPrice ?? quote.strike) < quote.strike);
  assert.ok((metrics?.probabilityOfProfit ?? 0) < (metrics?.probabilityInTheMoney ?? 1));
  assert.equal(metrics?.expectedExpiryPnlPerContract,
    (metrics?.modelPricePerContract ?? 0) * Math.exp(quote.riskFreeRate! * (quote.daysToExpiry / 365)) - 900 - 3);
});

test('canonical risk-neutral metrics fail closed without observed inputs or provider provenance', () => {
  const quote = canonicalBinanceRiskQuote();
  assert.equal(calculateQuoteCashRiskNeutralMetrics({ ...quote, sourceTimestamps: undefined }, 900), null);
  assert.equal(calculateQuoteCashRiskNeutralMetrics({ ...quote, ivStatus: 'ESTIMATED' }, 900), null);
  assert.equal(calculateQuoteCashRiskNeutralMetrics({ ...quote, estimatedFields: ['riskFreeRate'] }, 900), null);
  assert.equal(calculateQuoteCashRiskNeutralMetrics({
    ...quote,
    contractEconomics: { ...quote.contractEconomics!, provenance: { status: 'USER_ASSERTED' } },
  }, 900), null);
  assert.equal(calculateQuoteCashRiskNeutralMetrics({ ...quote, exerciseStyle: 'AMERICAN' }, 900), null);
  assert.equal(calculateQuoteCashRiskNeutralMetrics({ ...quote, pricingModel: undefined }, 900), null);
  assert.equal(calculateQuoteCashRiskNeutralMetrics({ ...quote, bid: 0 }, 900), null);
  assert.equal(calculateQuoteCashRiskNeutralMetrics({ ...quote, sourceTimestamps: { index: '2026-11-25T03:00:00.000Z' } }, 900), null);
  assert.equal(calculateQuoteCashRiskNeutralMetrics({ ...quote, unit: 1 }, 900), null);
  assert.equal(calculateQuoteCashRiskNeutralMetrics({ ...quote, venue: 'CSV' }, 900), null);
});
