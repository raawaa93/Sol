import assert from 'node:assert/strict';
import test from 'node:test';
import { blackScholes, getBreakeven, getExpiryPnl, getExpectedMove, getMaxLoss, getSpreadPct, impliedVolatility } from './options.ts';
import type { OptionQuote } from './types';

const call: OptionQuote = {
  id: 'BTC-test-C', symbol: 'BTC-test-C', underlying: 'BTC', expiry: '2026-12-30T08:00:00.000Z',
  daysToExpiry: 30, strike: 100, type: 'CALL', bid: 4.9, ask: 5.1, markPrice: 5,
  iv: 0.4, delta: 0.5, gamma: 0.01, theta: -0.1, vega: 0.2, openInterest: 10, volume: 4, spot: 100, unit: 1,
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

test('expiry payoff is net of premium, quantity and fees', () => {
  assert.ok(Math.abs(getExpiryPnl(call, 120, 5, 0.1, 0.2) - 1.3) < 1e-8);
  assert.ok(Math.abs(getExpiryPnl(put, 80, 5, 0.1, 0.2) - 1.3) < 1e-8);
  assert.ok(Math.abs(getExpiryPnl(call, 80, 5, 0.1, 0.2) + 0.7) < 1e-8);
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
