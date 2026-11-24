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
  assert.equal(result.valid, true, JSON.stringify(result));
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
  assert.equal(premiumMismatch.valid, true, JSON.stringify(premiumMismatch));
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


test('rejects a missing deliverables array instead of treating it as empty', () => {
  const malformed = standardEquity({
    exercise: {
      style: 'EUROPEAN',
      settlement: 'CASH',
      settlementCurrency: 'USD',
      cashSettlement: {
        formula: 'INTRINSIC_VALUE',
        reference: 'SPOT',
        currency: 'USD',
        multiplier: 1,
      },
    } as unknown as ContractEconomics['exercise'],
  });
  const result = validateContractEconomics(malformed);
  assert.ok(result.issues.includes('INVALID_DELIVERABLES_COLLECTION'));
  assert.equal(result.valid, false);
});


test('accepts futures delivery only with explicit point value and currency', () => {
  const result = validateContractEconomics(standardEquity({
    exercise: {
      style: 'EUROPEAN',
      settlement: 'FUTURE_DELIVERY',
      aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 1 },
      settlementCurrency: 'USD',
      deliverables: [{ type: 'FUTURE', symbol: 'CL', amount: 1, currency: 'USD', pointValue: 1000 }],
    },
  }));
  assert.equal(result.valid, true);
  assert.equal(result.adapterReady, true);
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


test('synthetic demo provenance is never ready for production adapters', () => {
  const result = validateContractEconomics(standardEquity({
    provenance: { status: 'SYNTHETIC_DEMO' },
  }));
  assert.equal(result.valid, true);
  assert.equal(result.adapterReady, false);
  assert.ok(result.unsupportedReasons.includes('SYNTHETIC_DEMO_ONLY'));
});

test('malformed runtime payloads fail closed without throwing', () => {
  const withNullDeliverable = standardEquity({
    exercise: {
      style: 'AMERICAN',
      settlement: 'PHYSICAL',
      aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 100 },
      settlementCurrency: 'USD',
      deliverables: [null],
    } as unknown as ContractEconomics['exercise'],
  });
  assert.doesNotThrow(() => validateContractEconomics(withNullDeliverable));
  assert.ok(validateContractEconomics(withNullDeliverable).issues.includes('INVALID_DELIVERABLE'));

  const malformedProvenance = standardEquity({
    provenance: {
      status: 'PROVIDER_VERIFIED',
      provider: 42,
      sourceRef: {},
      retrievedAt: '2026-11-24 08:00:00',
    } as unknown as ContractEconomics['provenance'],
  });
  const provenanceResult = validateContractEconomics(malformedProvenance);
  assert.equal(provenanceResult.valid, false);
  assert.ok(provenanceResult.issues.includes('MISSING_PROVIDER_PROVENANCE'));
  assert.ok(provenanceResult.issues.includes('INVALID_PROVIDER_TIMESTAMP'));

  const primitive = validateContractEconomics(null);
  assert.equal(primitive.valid, false);
  assert.equal(primitive.adapterReady, false);
  assert.ok(primitive.issues.includes('INVALID_CONTRACT_ECONOMICS'));
});

test('provider timestamps require RFC 3339 timezone information', () => {
  const timezoneLess = validateContractEconomics(standardEquity({
    provenance: {
      status: 'PROVIDER_VERIFIED',
      provider: 'EXCHANGE',
      sourceRef: '/contract-spec',
      retrievedAt: '2026-11-24T08:00:00',
    },
  }));
  assert.ok(timezoneLess.issues.includes('INVALID_PROVIDER_TIMESTAMP'));
  assert.equal(timezoneLess.adapterReady, false);

  const withOffset = validateContractEconomics(standardEquity({
    provenance: {
      status: 'PROVIDER_VERIFIED',
      provider: 'EXCHANGE',
      sourceRef: '/contract-spec',
      retrievedAt: '2026-11-24T08:00:00+03:00',
    },
  }));
  assert.equal(withOffset.valid, true);
  assert.equal(withOffset.adapterReady, true);
});

test('currency identifiers support settlement assets without implying cross-asset equivalence', () => {
  const usdc = validateContractEconomics(standardEquity({
    premium: { multiplier: 1, quoteCurrency: 'USDC', priceUnit: 'PER_CONTRACT' },
    exercise: {
      style: 'EUROPEAN',
      settlement: 'CASH',
      settlementCurrency: 'USDC',
      deliverables: [],
      cashSettlement: {
        formula: 'INTRINSIC_VALUE',
        reference: 'INDEX',
        currency: 'USDC',
        multiplier: 1,
      },
    },
  }));
  assert.equal(usdc.valid, true, JSON.stringify(usdc));
  assert.equal(usdc.adapterReady, true);
});


test('premium cash uses only the premium multiplier and adds fees once', async () => {
  const { calculatePremiumCash } = await import('./contract-economics-calculations.ts');
  const economics = standardEquity({
    premium: { multiplier: 100, quoteCurrency: 'USD', priceUnit: 'PER_UNDERLYING_UNIT' },
    exercise: {
      style: 'AMERICAN',
      settlement: 'PHYSICAL',
      aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 100 },
      settlementCurrency: 'USD',
      deliverables: [{ type: 'EQUITY', symbol: 'NVDA', amount: 10, currency: 'USD' }],
    },
  });
  const result = calculatePremiumCash({ economics, premiumPrice: 2.5, contracts: 2, fees: 1.25 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.premiumAmount, 500);
    assert.equal(result.value.amount, 501.25);
    assert.equal(result.value.currency, 'USD');
  }
});

test('deliverable package values adjusted equity and fixed cash independently', async () => {
  const { valueDeliverablePackage } = await import('./contract-economics-calculations.ts');
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
  const result = valueDeliverablePackage(economics, { NVDA: { price: 500, currency: 'USD' } });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.components[0].value, 5000);
    assert.equal(result.value.components[1].value, 25);
    assert.equal(result.value.totalsByCurrency.USD, 5025);
  }
});

test('deliverable package never combines different currencies', async () => {
  const { valueDeliverablePackage } = await import('./contract-economics-calculations.ts');
  const economics = standardEquity({
    exercise: {
      style: 'AMERICAN',
      settlement: 'PHYSICAL',
      aggregateExerciseCash: { basis: 'FIXED', currency: 'USD', amount: 5000 },
      settlementCurrency: 'USD',
      deliverables: [
        { type: 'EQUITY', symbol: 'NVDA', amount: 10, currency: 'USD' },
        { type: 'CASH', currency: 'USDC', amount: 25 },
      ],
    },
  });
  const result = valueDeliverablePackage(economics, { NVDA: { price: 500, currency: 'USD' } });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.totalsByCurrency.USD, 5000);
    assert.equal(result.value.totalsByCurrency.USDC, 25);
    assert.equal(Object.keys(result.value.totalsByCurrency).length, 2);
  }
});

test('aggregate exercise cash uses its own multiplier, not the premium multiplier', async () => {
  const { calculateAggregateExerciseCash } = await import('./contract-economics-calculations.ts');
  const economics = standardEquity({
    premium: { multiplier: 100, quoteCurrency: 'USD', priceUnit: 'PER_UNDERLYING_UNIT' },
    exercise: {
      style: 'AMERICAN',
      settlement: 'PHYSICAL',
      aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 10 },
      settlementCurrency: 'USD',
      deliverables: [{ type: 'EQUITY', symbol: 'NVDA', amount: 10, currency: 'USD' }],
    },
  });
  const result = calculateAggregateExerciseCash(economics, 50, 2);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.amount, 1000);
});

test('exercise cash with a fixed basis does not depend on the supplied strike', async () => {
  const { calculateAggregateExerciseCash } = await import('./contract-economics-calculations.ts');
  const economics = standardEquity({
    exercise: {
      style: 'AMERICAN',
      settlement: 'PHYSICAL',
      aggregateExerciseCash: { basis: 'FIXED', currency: 'USD', amount: 425 },
      settlementCurrency: 'USD',
      deliverables: [{ type: 'EQUITY', symbol: 'NVDA', amount: 10, currency: 'USD' }],
    },
  });
  const result = calculateAggregateExerciseCash(economics, 999, 3);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.amount, 1275);
});

test('future deliverables remain blocked without a futures-specific valuation adapter', async () => {
  const { valueDeliverablePackage } = await import('./contract-economics-calculations.ts');
  const economics = standardEquity({
    exercise: {
      style: 'EUROPEAN',
      settlement: 'FUTURE_DELIVERY',
      aggregateExerciseCash: { basis: 'STRIKE_MULTIPLIER', currency: 'USD', multiplier: 1 },
      settlementCurrency: 'USD',
      deliverables: [{ type: 'FUTURE', symbol: 'CL', amount: 1, currency: 'USD', pointValue: 1000 }],
    },
  });
  const result = valueDeliverablePackage(economics, {});
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'FUTURE_DELIVERY_REQUIRES_ADAPTER');
});
