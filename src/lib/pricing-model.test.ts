import assert from 'node:assert/strict';
import test from 'node:test';
import { priceOption } from './pricing-model.ts';

const base = {
  strike: 100,
  daysToExpiry: 365,
  volatility: 0.2,
  type: 'CALL' as const,
  rate: 0.05,
  exerciseStyle: 'EUROPEAN' as const,
  settlementStyle: 'CASH' as const,
};

test('futures options route to Black-76 and price from the forward, not spot', () => {
  const result = priceOption({ ...base, underlyingKind: 'FUTURE', spot: 999, forward: 100 });
  assert.equal(result.status, 'SUPPORTED');
  if (result.status !== 'SUPPORTED') return;
  assert.equal(result.model, 'BLACK_76');
  assert.ok(Math.abs(result.greeks.price - 7.57708214642728) < 1e-10);
  assert.ok(Math.abs(result.greeks.delta - 0.5135001229824934) < 1e-10);
  assert.ok(Math.abs(result.greeks.gamma - 0.018879647164532515) < 1e-10);
  assert.ok(Math.abs(result.greeks.vegaPerVolPoint - 0.3775929432906503) < 1e-10);
});

test('Black-76 Greeks agree with finite differences and put-call parity', () => {
  const call = priceOption({ ...base, underlyingKind: 'FUTURE', forward: 100 });
  const put = priceOption({ ...base, type: 'PUT', underlyingKind: 'FUTURE', forward: 100 });
  assert.equal(call.status, 'SUPPORTED');
  assert.equal(put.status, 'SUPPORTED');
  if (call.status !== 'SUPPORTED' || put.status !== 'SUPPORTED') return;
  const discount = Math.exp(-base.rate);
  assert.ok(Math.abs((call.greeks.price - put.greeks.price) - discount * (100 - base.strike)) < 1e-10);

  const h = 0.01;
  const up = priceOption({ ...base, underlyingKind: 'FUTURE', forward: 100 + h });
  const down = priceOption({ ...base, underlyingKind: 'FUTURE', forward: 100 - h });
  assert.equal(up.status, 'SUPPORTED');
  assert.equal(down.status, 'SUPPORTED');
  if (up.status !== 'SUPPORTED' || down.status !== 'SUPPORTED') return;
  const deltaFd = (up.greeks.price - down.greeks.price) / (2 * h);
  const gammaFd = (up.greeks.price - 2 * call.greeks.price + down.greeks.price) / (h * h);
  assert.ok(Math.abs(deltaFd - call.greeks.delta) < 1e-6);
  assert.ok(Math.abs(gammaFd - call.greeks.gamma) < 1e-5);
});

test('Black-76 expiry uses a symmetric ATM delta convention', () => {
  const call = priceOption({ ...base, daysToExpiry: 0, underlyingKind: 'FUTURE', forward: 100 });
  const put = priceOption({ ...base, daysToExpiry: 0, type: 'PUT', underlyingKind: 'FUTURE', forward: 100 });
  assert.equal(call.status, 'SUPPORTED');
  assert.equal(put.status, 'SUPPORTED');
  if (call.status !== 'SUPPORTED' || put.status !== 'SUPPORTED') return;
  assert.equal(call.greeks.delta, 0.5);
  assert.equal(put.greeks.delta, -0.5);
});

test('spot options route to generalized Black-Scholes with explicit zero carry', () => {
  const result = priceOption({ ...base, underlyingKind: 'SPOT', spot: 100, carryYield: 0 });
  assert.equal(result.status, 'SUPPORTED');
  if (result.status !== 'SUPPORTED') return;
  assert.equal(result.model, 'BLACK_SCHOLES_CARRY');
  assert.ok(Math.abs(result.greeks.price - 10.450583572185565) < 1e-10);
});

test('non-zero carry is included in spot pricing and Greeks', () => {
  const result = priceOption({ ...base, underlyingKind: 'SPOT', spot: 100, carryYield: 0.02 });
  assert.equal(result.status, 'SUPPORTED');
  if (result.status !== 'SUPPORTED') return;
  assert.ok(Math.abs(result.greeks.price - 9.227005508154036) < 1e-10);
  assert.ok(Math.abs(result.greeks.delta - 0.586851146134764) < 1e-10);
  assert.ok(Math.abs(result.greeks.rhoPerRatePoint - 0.49458109105322356) < 1e-10);
});

test('put prices and Greeks respect generalized Black-Scholes carry', () => {
  const result = priceOption({ ...base, type: 'PUT', underlyingKind: 'SPOT', spot: 100, carryYield: 0.02 });
  assert.equal(result.status, 'SUPPORTED');
  if (result.status !== 'SUPPORTED') return;
  assert.ok(Math.abs(result.greeks.price - 6.330080627549918) < 1e-10);
  assert.ok(Math.abs(result.greeks.delta - (-0.3933475271719913)) < 1e-10);
  assert.ok(Math.abs(result.greeks.rhoPerRatePoint - (-0.4566483334474905)) < 1e-10);
});

test('American, Bermudan and unknown exercise mechanics are rejected', () => {
  for (const exerciseStyle of ['AMERICAN', 'BERMUDAN', 'UNKNOWN', undefined] as const) {
    const result = priceOption({ ...base, exerciseStyle, underlyingKind: 'SPOT', spot: 100, carryYield: 0 });
    assert.equal(result.status, 'UNSUPPORTED');
  }
});

test('missing settlement style or rate is rejected', () => {
  assert.equal(priceOption({ ...base, settlementStyle: undefined, underlyingKind: 'SPOT', spot: 100, carryYield: 0 }).status, 'UNSUPPORTED');
  assert.equal(priceOption({ ...base, rate: undefined, underlyingKind: 'FUTURE', forward: 100 }).status, 'UNSUPPORTED');
});

test('unknown, perpetual and unsupported underlying kinds are rejected', () => {
  for (const underlyingKind of [undefined, 'UNKNOWN', 'PERPETUAL'] as const) {
    const result = priceOption({ ...base, underlyingKind, spot: 100, forward: 100, carryYield: 0 });
    assert.equal(result.status, 'UNSUPPORTED');
  }
});

test('futures options require a valid forward price and never fall back to spot', () => {
  const result = priceOption({ ...base, underlyingKind: 'FUTURE', spot: 100, forward: undefined });
  assert.equal(result.status, 'UNSUPPORTED');
});

test('spot and carry inputs are validated', () => {
  assert.equal(priceOption({ ...base, underlyingKind: 'SPOT', spot: 0, carryYield: 0 }).status, 'UNSUPPORTED');
  assert.equal(priceOption({ ...base, underlyingKind: 'SPOT', spot: 100, carryYield: undefined }).status, 'UNSUPPORTED');
  assert.equal(priceOption({ ...base, underlyingKind: 'SPOT', spot: 100, carryYield: Number.NaN }).status, 'UNSUPPORTED');
});

test('zero-day expiry returns intrinsic value and finite limiting Greeks', () => {
  const result = priceOption({ ...base, daysToExpiry: 0, underlyingKind: 'SPOT', spot: 100, carryYield: 0 });
  assert.equal(result.status, 'SUPPORTED');
  if (result.status !== 'SUPPORTED') return;
  assert.equal(result.greeks.price, 0);
  assert.equal(result.greeks.delta, 0.5);
  assert.equal(result.greeks.gamma, 0);
});
