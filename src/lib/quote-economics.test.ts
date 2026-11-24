import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateQuoteCashBreakeven,
  calculateQuoteCashExpiryPnl,
  calculateQuoteCashMaxLoss,
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
