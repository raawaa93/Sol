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
