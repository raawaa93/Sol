import assert from 'node:assert/strict';
import test from 'node:test';
import { validateContractEconomics } from './contract-economics.ts';
import type { ContractEconomics } from './types.ts';

function standardEquity(overrides: Partial<ContractEconomics> = {}): ContractEconomics {
  return {
    premium: { multiplier: 100, quoteCurrency: 'USD', priceUnit: 'PER_UNDERLYING_UNIT' },
    exercise: {
      style: 'AMERICAN',
      settlement: 'PHYSICAL',
      aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 100 },
      settlementCurrency: 'USD',
      deliverables: [{ type: 'EQUITY', symbol: 'NVDA', amount: 100, currency: 'USD' }],
    },
    provenance: {
      status: 'PROVIDER_VERIFIED',
      provider: 'BINANCE_STOCK_OPTIONS',
      sourceRef: '/sapi/v1/equity/option/market/exchangeInfo',
      retrievedAt: '2026-11-24T08:00:00.000Z',
    },
    ...overrides,
  };
}

test('validates a standard equity contract with distinct premium and exercise terms', () => {
  const result = validateContractEconomics(standardEquity());
  assert.equal(result.valid, true);
  assert.equal(result.adapterReady, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.unsupportedReasons, []);
});

test('preserves adjusted multi-component equity and cash deliverables without collapsing scales', () => {
  const economics = standardEquity({
    exercise: {
      style: 'AMERICAN',
      settlement: 'PHYSICAL',
      aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 100 },
      settlementCurrency: 'USD',
      deliverables: [
        { type: 'EQUITY', symbol: 'NVDA', amount: 10, currency: 'USD' },
        { type: 'CASH', currency: 'USD', amount: 25 },
      ],
    },
  });
  const result = validateContractEconomics(economics);
  assert.equal(result.valid, true);
  assert.equal(result.adapterReady, true);
  assert.equal(economics.premium.multiplier, 100);
  assert.equal(economics.exercise.deliverables[0].amount, 10);
  assert.equal(economics.exercise.deliverables[1].amount, 25);
});

test('requires an explicit formula for cash-settled contracts', () => {
  const economics = standardEquity({
    exercise: {
      style: 'EUROPEAN',
      settlement: 'CASH',
      settlementCurrency: 'USD',
      deliverables: [],
      cashSettlement: {
        formula: 'INTRINSIC_VALUE',
        reference: 'INDEX',
        currency: 'USD',
        multiplier: 100,
      },
    },
  });
  const result = validateContractEconomics(economics);
  assert.equal(result.valid, true);
  assert.equal(result.adapterReady, true);
  const missing = validateContractEconomics({
    ...economics,
    exercise: { style: 'EUROPEAN', settlement: 'CASH', settlementCurrency: 'USD', deliverables: [] },
  });
  assert.ok(missing.issues.includes('MISSING_CASH_SETTLEMENT_FORMULA'));
  assert.equal(missing.adapterReady, false);
});

test('requires physical deliverables and separately specified aggregate exercise cash', () => {
  const result = validateContractEconomics(standardEquity({
    exercise: {
      style: 'EUROPEAN',
      settlement: 'PHYSICAL',
      settlementCurrency: 'USD',
      deliverables: [],
    },
  }));
  assert.ok(result.issues.includes('MISSING_PHYSICAL_DELIVERABLES'));
  assert.ok(result.issues.includes('MISSING_AGGREGATE_EXERCISE_CASH'));
  assert.equal(result.valid, false);
});

test('unknown or user-asserted provenance remains inspectable but cannot support calculations', () => {
  const userAsserted = validateContractEconomics(standardEquity({
    provenance: { status: 'USER_ASSERTED' },
  }));
  assert.equal(userAsserted.valid, true);
  assert.equal(userAsserted.adapterReady, false);
  assert.ok(userAsserted.unsupportedReasons.includes('USER_ASSERTED_PROVENANCE'));

  const unknown = validateContractEconomics(standardEquity({
    exercise: {
      style: 'UNKNOWN',
      settlement: 'UNKNOWN',
      deliverables: [],
    },
    provenance: { status: 'UNKNOWN' },
  }));
  assert.equal(unknown.valid, true);
  assert.equal(unknown.adapterReady, false);
  assert.ok(unknown.unsupportedReasons.includes('UNKNOWN_EXERCISE_STYLE'));
  assert.ok(unknown.unsupportedReasons.includes('UNKNOWN_SETTLEMENT_STYLE'));
  assert.ok(unknown.unsupportedReasons.includes('UNKNOWN_PROVENANCE'));
});

test('cross-currency premium, exercise cash or deliverables require explicit FX evidence', () => {
  const premiumMismatch = validateContractEconomics(standardEquity({
    exercise: {
      style: 'AMERICAN',
      settlement: 'PHYSICAL',
      aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 100 },
      settlementCurrency: 'USDC',
      deliverables: [{ type: 'EQUITY', symbol: 'NVDA', amount: 100, currency: 'USDC' }],
    },
  }));
  assert.equal(premiumMismatch.valid, true);
  assert.equal(premiumMismatch.adapterReady, false);
  assert.ok(premiumMismatch.unsupportedReasons.includes('CROSS_CURRENCY_TOTALS_REQUIRE_FX'));

  const unknownCurrency = validateContractEconomics(standardEquity({
    exercise: {
      style: 'AMERICAN',
      settlement: 'PHYSICAL',
      aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 100 },
      settlementCurrency: 'USD',
      deliverables: [{ type: 'EQUITY', symbol: 'NVDA', amount: 100 }],
    },
  }));
  assert.equal(unknownCurrency.valid, true);
  assert.equal(unknownCurrency.adapterReady, false);
  assert.ok(unknownCurrency.unsupportedReasons.includes('DELIVERABLE_CURRENCY_UNKNOWN'));
});

test('futures delivery requires a future deliverable with a positive point value', () => {
  const result = validateContractEconomics(standardEquity({
    exercise: {
      style: 'EUROPEAN',
      settlement: 'FUTURE_DELIVERY',
      aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 1 },
      settlementCurrency: 'USD',
      deliverables: [{ type: 'FUTURE', symbol: 'CL', amount: 1, currency: 'USD' }],
    },
  }));
  assert.ok(result.issues.includes('INVALID_DELIVERABLE'));
  assert.equal(result.valid, false);
});


test('per-contract quoted premiums cannot also apply a non-unit premium multiplier', () => {
  const result = validateContractEconomics(standardEquity({
    premium: { multiplier: 100, quoteCurrency: 'USD', priceUnit: 'PER_CONTRACT' },
  }));
  assert.ok(result.issues.includes('INVALID_PREMIUM_SCALE_COMBINATION'));
  assert.equal(result.valid, false);
  assert.equal(result.adapterReady, false);
});

test('rejects invalid premium scale and missing provider provenance', () => {
  const result = validateContractEconomics(standardEquity({
    premium: { multiplier: 0, quoteCurrency: 'usd', priceUnit: 'PER_CONTRACT' },
    provenance: { status: 'PROVIDER_VERIFIED' },
  }));
  assert.ok(result.issues.includes('INVALID_PREMIUM_MULTIPLIER'));
  assert.ok(result.issues.includes('INVALID_PREMIUM_CURRENCY'));
  assert.ok(result.issues.includes('MISSING_PROVIDER_PROVENANCE'));
  assert.ok(result.issues.includes('INVALID_PROVIDER_TIMESTAMP'));
  assert.equal(result.valid, false);
});

test('canonical economics round-trip through JSON without collapsing deliverable components', () => {
  const economics = standardEquity({
    exercise: {
      style: 'AMERICAN',
      settlement: 'PHYSICAL',
      aggregateExerciseCash: { basis: 'FIXED', currency: 'USD', amount: 5000 },
      settlementCurrency: 'USD',
      deliverables: [
        { type: 'EQUITY', symbol: 'NVDA', amount: 10, currency: 'USD' },
        { type: 'CASH', currency: 'USD', amount: 25 },
      ],
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(economics)), economics);
});
