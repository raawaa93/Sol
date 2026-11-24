import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAssetPrice,
  formatNumber,
  formatOptionPrice,
  formatQuantity,
  formatSmallAmount,
  getOptionPricePrecision,
  getQuantityPrecision,
  getQuoteCurrency,
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

test('quote-currency formatting follows the selected contract instead of assuming USDT', () => {
  assert.equal(getQuoteCurrency({ venue: 'DEMO', quoteAsset: 'USD' }), 'USD');
  assert.equal(getQuoteCurrency({ venue: 'BINANCE' }), 'USDT');
  assert.equal(getQuoteCurrency({ venue: 'CBOE' }), undefined);
  assert.equal(formatOptionPrice(14.2, { priceScale: 3, quoteAsset: 'USD' }), '14.200 USD');
  assert.equal(formatOptionPrice(14.2, { priceScale: 3, venue: 'CBOE' }, null), '14.200');
  assert.equal(formatOptionPrice(14.2, { priceScale: 3, venue: 'BINANCE' }), '14.200 USDT');
  assert.equal(formatSmallAmount(12.5, 'EUR'), '12.50 EUR');
  assert.equal(formatSmallAmount(12.5, null), '12.50');
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

test('underlying prices adapt to the asset scale and preserve the selected currency', () => {
  assert.equal(formatAssetPrice(95_000, 95_000), '95,000 USDT');
  assert.equal(formatAssetPrice(95_000, 95_000, 'USD'), '95,000 USD');
  assert.equal(formatAssetPrice(0.45678, 0.45678, null), '0.4568');
  assert.equal(formatAssetPrice(0, 0.0001, 'USD'), '0 USD');
  assert.equal(formatNumber(Number.POSITIVE_INFINITY, 2), '—');
});
