import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAssetPrice,
  formatNumber,
  formatOptionPrice,
  formatQuantity,
  getOptionPricePrecision,
  getQuantityPrecision,
} from './format.ts';

const fractionalTick = [{ filterType: 'PRICE_FILTER', tickSize: '0.05' }];
const fractionalQuantityStep = [{ filterType: 'LOT_SIZE', stepSize: '0.0005' }];

test('option premiums retain meaningful precision instead of rounding small prices to zero', () => {
  assert.equal(formatOptionPrice(0.02), '0.02 USDT');
  assert.equal(formatOptionPrice(0.002), '0.0020 USDT');
  assert.equal(formatOptionPrice(0.00001), '0.00001000 USDT');
  assert.equal(formatOptionPrice(0), '—');
  assert.equal(formatOptionPrice(Number.NaN), '—');
});

test('Binance price scale and price tick determine option quote precision', () => {
  assert.equal(getOptionPricePrecision(14.2, { priceScale: 3 }), 3);
  assert.equal(formatOptionPrice(14.2, { priceScale: 3 }), '14.200 USDT');
  assert.equal(getOptionPricePrecision(0.15, { filters: fractionalTick }), 2);
  assert.equal(formatOptionPrice(0.15, { filters: fractionalTick }), '0.15 USDT');
  assert.equal(formatOptionPrice(0.001, { priceScale: 2 }), '0.0010 USDT');
});

test('quantity precision honors Binance step/scale and avoids floating point noise', () => {
  assert.equal(getQuantityPrecision({ filters: fractionalQuantityStep }), 4);
  assert.equal(formatQuantity(0.0005, { filters: fractionalQuantityStep }), '0.0005');
  assert.equal(formatQuantity(0.15000000000000002, { quantityScale: 2 }), '0.15');
  assert.equal(formatQuantity(1.234, { quantityScale: 2 }), '1.234');
});

test('underlying prices adapt to the asset scale and invalid numbers stay unavailable', () => {
  assert.equal(formatAssetPrice(95_000, 95_000), '95,000 USDT');
  assert.equal(formatAssetPrice(0.45678, 0.45678), '0.4568 USDT');
  assert.equal(formatAssetPrice(0, 0.0001), '0 USDT');
  assert.equal(formatNumber(Number.POSITIVE_INFINITY, 2), '—');
});
