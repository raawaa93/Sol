import assert from 'node:assert/strict';
import test from 'node:test';
import { mapBinanceStockOptionEconomics } from './binance-stock-options-economics.ts';
import { calculatePremiumCash, calculateAggregateExerciseCash, valueDeliverablePackage } from './contract-economics-calculations.ts';

const base = {
  symbol: 'NVDA260930C00100000',
  underlyingSymbol: 'NVDA',
  rootSymbol: 'NVDA',
  contractType: 'CALL',
  strikePrice: '100',
  multiplier: '100',
  contractSize: 100,
  deliverables: [{ type: 'EQUITY', symbol: 'NVDA', amount: '100' }],
  retrievedAt: '2026-11-24T10:00:00.000Z',
};

test('standard Binance stock option maps premium multiplier and delivered shares independently', () => {
  const economics = mapBinanceStockOptionEconomics(base);
  assert.ok(economics);
  assert.equal(economics.premium.multiplier, 100);
  assert.equal(economics.premium.quoteCurrency, 'USD');
  assert.equal(economics.premium.priceUnit, 'PER_UNDERLYING_UNIT');
  assert.equal(economics.exercise.settlement, 'PHYSICAL');
  assert.equal(economics.exercise.aggregateExerciseCash?.basis, 'STRIKE_MULTIPLIER');
  assert.equal(economics.exercise.aggregateExerciseCash?.multiplier, 100);
  assert.deepEqual(economics.exercise.deliverables, [
    { type: 'EQUITY', symbol: 'NVDA', amount: 100, currency: 'USD' },
  ]);
});

test('adjusted contract keeps premium multiplier separate from shares and cash deliverables', () => {
  const economics = mapBinanceStockOptionEconomics({
    ...base,
    symbol: 'GOOG1260930C00100000',
    underlyingSymbol: 'GOOG',
    rootSymbol: 'GOOG1',
    multiplier: '100',
    contractSize: 10,
    deliverables: [
      { type: 'EQUITY', symbol: 'GOOG', amount: '10' },
      { type: 'CASH', symbol: 'USD', amount: '125.50' },
    ],
  });
  assert.ok(economics);
  assert.equal(economics.premium.multiplier, 100);
  assert.equal(economics.exercise.aggregateExerciseCash?.multiplier, 10);
  assert.deepEqual(economics.exercise.deliverables, [
    { type: 'EQUITY', symbol: 'GOOG', amount: 10, currency: 'USD' },
    { type: 'CASH', currency: 'USD', amount: 125.5 },
  ]);

  const premium = calculatePremiumCash({ economics, premiumPrice: 2.5, contracts: 2 });
  assert.equal(premium.ok && premium.value.amount, 500);
  const exerciseCash = calculateAggregateExerciseCash(economics, 100, 2);
  assert.equal(exerciseCash.ok && exerciseCash.value.amount, 2_000);
  const packageValue = valueDeliverablePackage(economics, { GOOG: { price: 150, currency: 'USD' } });
  assert.equal(packageValue.ok && packageValue.value.totalsByCurrency.USD, 1_625);
});

test('stock option adapter rejects inferred or incomplete metadata', () => {
  assert.equal(mapBinanceStockOptionEconomics({ ...base, underlyingSymbol: '' }), null);
  assert.equal(mapBinanceStockOptionEconomics({ ...base, contractType: 'UNKNOWN' }), null);
  assert.equal(mapBinanceStockOptionEconomics({ ...base, multiplier: '0' }), null);
  assert.equal(mapBinanceStockOptionEconomics({ ...base, contractSize: 0 }), null);
  assert.equal(mapBinanceStockOptionEconomics({ ...base, deliverables: [] }), null);
  assert.equal(mapBinanceStockOptionEconomics({ ...base, deliverables: [{ type: 'OTHER', symbol: 'NVDA', amount: 100 }] }), null);
  assert.equal(mapBinanceStockOptionEconomics({ ...base, retrievedAt: 'not-a-date' }), null);
});
