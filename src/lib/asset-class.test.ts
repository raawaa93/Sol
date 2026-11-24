import assert from 'node:assert/strict';
import test from 'node:test';
import { inferAssetClass, parseAssetClass } from './asset-class.ts';

test('known crypto, metal and energy underlyings map to explicit asset classes', () => {
  assert.equal(inferAssetClass('BTC'), 'CRYPTO');
  assert.equal(inferAssetClass('XAU'), 'METALS');
  assert.equal(inferAssetClass('CL'), 'ENERGY');
});

test('unknown underlyings remain unknown instead of being guessed', () => {
  assert.equal(inferAssetClass('SPY'), 'UNKNOWN');
  assert.equal(parseAssetClass('not-a-class'), 'UNKNOWN');
});

test('asset class parsing is case-insensitive and accepts explicit listed classes', () => {
  assert.equal(parseAssetClass('equity'), 'EQUITY');
  assert.equal(parseAssetClass('agriculture'), 'AGRICULTURE');
});
