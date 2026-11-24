import assert from 'node:assert/strict';
import test from 'node:test';
import { priceOption } from './pricing-model.ts';

const base = {
  strike: 100,
  daysToExpiry: 365,
  volatility: 0.2,
  type: 'CALL' as const,
  rate: 0.05,
};

test('futures options route to Black-76 and price from the forward, not spot', () => {
  const result = priceOption({
    ...base,
    underlyingKind: 'FUTURE',
    spot: 999,
    forward: 100,
  });

  assert.equal(result.status, 'SUPPORTED');
  if (result.status !== 'SUPPORTED') return;
  assert.equal(result.model, 'BLACK_76');
  assert.ok(Math.abs(result.greeks.price - 7.57708214642728) < 1e-10);
  assert.ok(Math.abs(result.greeks.delta - 0.5135001229824934) < 1e-10);
  assert.ok(Math.abs(result.greeks.gamma - 0.018879647164532515) < 1e-10);
  assert.ok(Math.abs(result.greeks.vegaPerVolPoint - 0.3775929432906503) < 1e-10);
});

test('spot options route to Black-Scholes only when spot contract metadata is explicit', () => {
  const result = priceOption({
    ...base,
    underlyingKind: 'SPOT',
    spot: 100,
  });

  assert.equal(result.status, 'SUPPORTED');
  if (result.status !== 'SUPPORTED') return;
  assert.equal(result.model, 'BLACK_SCHOLES');
  assert.ok(Math.abs(result.greeks.price - 10.450583572185565) < 1e-10);
});

test('unknown and perpetual underlyings are rejected rather than silently priced as spot', () => {
  for (const underlyingKind of [undefined, 'UNKNOWN', 'PERPETUAL'] as const) {
    const result = priceOption({
      ...base,
      underlyingKind,
      spot: 100,
      forward: 100,
    });
    assert.equal(result.status, 'UNSUPPORTED');
  }
});

test('futures options require a valid forward price and never fall back to spot', () => {
  const result = priceOption({
    ...base,
    underlyingKind: 'FUTURE',
    spot: 100,
    forward: undefined,
  });
  assert.equal(result.status, 'UNSUPPORTED');
});

test('Black-76 put price and forward delta agree with put-call parity', () => {
  const call = priceOption({
    ...base,
    underlyingKind: 'FUTURE',
    forward: 100,
    type: 'CALL',
  });
  const put = priceOption({
    ...base,
    underlyingKind: 'FUTURE',
    forward: 100,
    type: 'PUT',
  });

  assert.equal(call.status, 'SUPPORTED');
  assert.equal(put.status, 'SUPPORTED');
  if (call.status !== 'SUPPORTED' || put.status !== 'SUPPORTED') return;
  const discount = Math.exp(-base.rate);
  assert.ok(Math.abs((call.greeks.price - put.greeks.price) - discount * (100 - 100)) < 1e-10);
  assert.ok(Math.abs((call.greeks.delta - put.greeks.delta) - discount) < 1e-10);
});

test('Black-76 forward delta agrees with a central finite difference', () => {
  const result = priceOption({ ...base, underlyingKind: 'FUTURE', forward: 100 });
  const up = priceOption({ ...base, underlyingKind: 'FUTURE', forward: 100.001 });
  const down = priceOption({ ...base, underlyingKind: 'FUTURE', forward: 99.999 });
  assert.equal(result.status, 'SUPPORTED');
  assert.equal(up.status, 'SUPPORTED');
  assert.equal(down.status, 'SUPPORTED');
  if (result.status !== 'SUPPORTED' || up.status !== 'SUPPORTED' || down.status !== 'SUPPORTED') return;
  const finiteDifference = (up.greeks.price - down.greeks.price) / 0.002;
  assert.ok(Math.abs(result.greeks.delta - finiteDifference) < 1e-7);
});
