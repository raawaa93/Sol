import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampRiskBudget,
  isUsdEquivalentQuoteAsset,
  isWithinRiskBudget,
} from './risk-budget.ts';

test('USD and dollar-pegged stablecoin quote assets are eligible for the USD-equivalent cap', () => {
  assert.equal(isUsdEquivalentQuoteAsset('USD'), true);
  assert.equal(isUsdEquivalentQuoteAsset('usdt'), true);
  assert.equal(isUsdEquivalentQuoteAsset('USDC'), true);
});

test('non-dollar and unknown quote assets are not treated as USD', () => {
  assert.equal(isUsdEquivalentQuoteAsset('EUR'), false);
  assert.equal(isUsdEquivalentQuoteAsset('GBP'), false);
  assert.equal(isUsdEquivalentQuoteAsset(undefined), false);
  assert.equal(isUsdEquivalentQuoteAsset(''), false);
});

test('budget input is clamped between zero and the hard USD 60 ceiling', () => {
  assert.equal(clampRiskBudget(-10), 0);
  assert.equal(clampRiskBudget(25), 25);
  assert.equal(clampRiskBudget(60), 60);
  assert.equal(clampRiskBudget(500), 60);
  assert.equal(clampRiskBudget(Number.NaN), 0);
  assert.equal(clampRiskBudget(Number.POSITIVE_INFINITY), 0);
});

test('maximum loss including fees may equal but may not exceed the selected USD-equivalent budget', () => {
  assert.equal(isWithinRiskBudget(60, 60, 'USD'), true);
  assert.equal(isWithinRiskBudget(60.01, 60, 'USD'), false);
  assert.equal(isWithinRiskBudget(35, 40, 'USDT'), true);
  assert.equal(isWithinRiskBudget(61, 500, 'USDC'), false);
});

test('unsupported currency and invalid maximum-loss values fail closed', () => {
  assert.equal(isWithinRiskBudget(10, 60, 'EUR'), false);
  assert.equal(isWithinRiskBudget(Number.NaN, 60, 'USD'), false);
  assert.equal(isWithinRiskBudget(Number.POSITIVE_INFINITY, 60, 'USD'), false);
  assert.equal(isWithinRiskBudget(-1, 60, 'USD'), false);
  assert.equal(isWithinRiskBudget(10, Number.NaN, 'USD'), false);
  assert.equal(isWithinRiskBudget(10, -1, 'USD'), false);
});
