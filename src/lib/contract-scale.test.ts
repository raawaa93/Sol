import assert from 'node:assert/strict';
import test from 'node:test';
import { getContractScaleIssue, getContractScaleIssueMessage, hasLegacyScalarAnalyticsCapability, hasCanonicalBinanceModelGreekCapability } from './contract-scale.ts';
import type { OptionQuote } from './types.ts';

const demo = { venue: 'DEMO', unit: 1, contractMultiplier: 1 };
const binanceCrypto = {
  venue: 'BINANCE',
  assetClass: 'CRYPTO',
  underlyingKind: 'SPOT',
  exerciseStyle: 'EUROPEAN',
  settlementStyle: 'CASH',
  quoteAsset: 'USDT',
  settlementAsset: 'USDT',
  unit: 1,
} as const;

test('synthetic Demo scale is trusted only in Demo mode', () => {
  assert.equal(getContractScaleIssue(demo, 'DEMO'), undefined);
  assert.equal(getContractScaleIssue(demo, 'CSV'), 'UNSUPPORTED_CONTRACT_SCALE');
});

test('documented Binance European cash-settled crypto uses exchange unit in Binance mode', () => {
  assert.equal(getContractScaleIssue(binanceCrypto, 'BINANCE'), undefined);
  assert.equal(getContractScaleIssue({ ...binanceCrypto, venue: 'OTHER' }, 'BINANCE'), 'UNSUPPORTED_CONTRACT_SCALE');
  assert.equal(getContractScaleIssue({ ...binanceCrypto, settlementAsset: 'BTC' }, 'BINANCE'), 'UNSUPPORTED_CONTRACT_SCALE');
});

test('CSV crypto requires a named non-Demo venue and explicit matching multiplier', () => {
  assert.equal(getContractScaleIssue({ ...binanceCrypto, contractMultiplier: 1 }, 'CSV'), undefined);
  assert.equal(getContractScaleIssue({ ...binanceCrypto, contractMultiplier: 1, venue: 'DEMO' }, 'CSV'), 'UNSUPPORTED_CONTRACT_SCALE');
  assert.equal(getContractScaleIssue(binanceCrypto, 'CSV'), 'UNSUPPORTED_CONTRACT_SCALE');
});

test('Binance unit greater than one blocks until premium and deliverable scales are separated', () => {
  assert.equal(getContractScaleIssue({ ...binanceCrypto, unit: 100 }, 'BINANCE'), 'PREMIUM_SCALE_UNVERIFIED');
  assert.equal(getContractScaleIssue({ ...binanceCrypto, unit: 100, contractMultiplier: 100 }, 'CSV'), 'PREMIUM_SCALE_UNVERIFIED');
  assert.match(getContractScaleIssueMessage('PREMIUM_SCALE_UNVERIFIED'), /unit تمثل كمية الأصل الأساسي/);
});

test('different quote and settlement currencies block scalar per-contract P&L', () => {
  assert.equal(getContractScaleIssue({ ...binanceCrypto, settlementAsset: 'USDC' }, 'BINANCE'), 'UNSUPPORTED_CONTRACT_SCALE');
});

test('estimated or missing contract unit blocks per-contract calculations', () => {
  assert.equal(getContractScaleIssue({ ...binanceCrypto, estimatedFields: ['unit'] }, 'BINANCE'), 'UNIT_UNVERIFIED');
  assert.equal(getContractScaleIssue({ ...binanceCrypto, unit: 0 }, 'BINANCE'), 'UNIT_UNVERIFIED');
});

test('distinct contract multiplier blocks the scalar per-contract model', () => {
  assert.equal(getContractScaleIssue({ ...binanceCrypto, contractMultiplier: 1000 }, 'BINANCE'), 'MULTIPLIER_MISMATCH');
  assert.match(getContractScaleIssueMessage('MULTIPLIER_MISMATCH'), /مقياس التسعير والتسليم غير ممثل/);
});

test('futures and commodity perpetual scale models remain blocked even with matching units', () => {
  assert.equal(getContractScaleIssue({
    venue: 'CME',
    assetClass: 'ENERGY',
    underlyingKind: 'FUTURE',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'PHYSICAL',
    unit: 1,
    contractMultiplier: 1,
  }, 'CSV'), 'UNSUPPORTED_CONTRACT_SCALE');
  assert.equal(getContractScaleIssue({
    venue: 'BINANCE',
    assetClass: 'METALS',
    underlyingKind: 'PERPETUAL',
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'CASH',
    unit: 1,
  }, 'BINANCE'), 'UNSUPPORTED_CONTRACT_SCALE');
  assert.match(getContractScaleIssueMessage('UNSUPPORTED_CONTRACT_SCALE'), /نموذج مقياس هذا السوق/);
});

test('CSV scale values alone do not establish a supported American equity deliverable model', () => {
  assert.equal(getContractScaleIssue({
    venue: 'CBOE',
    assetClass: 'EQUITY',
    underlyingKind: 'SPOT',
    exerciseStyle: 'AMERICAN',
    settlementStyle: 'PHYSICAL',
    unit: 100,
    contractMultiplier: 100,
  }, 'CSV'), 'UNSUPPORTED_CONTRACT_SCALE');
});

test('canonical terms disable legacy scalar analytics even when unit one is numerically compatible', () => {
  const canonicalBinanceQuote = {
    ...binanceCrypto,
    contractEconomics: {
      premium: { multiplier: 1, quoteCurrency: 'USDT', priceUnit: 'PER_CONTRACT' },
      exercise: {
        style: 'EUROPEAN',
        settlement: 'CASH',
        settlementCurrency: 'USDT',
        deliverables: [],
        cashSettlement: { formula: 'INTRINSIC_VALUE', reference: 'INDEX', currency: 'USDT', multiplier: 1 },
      },
      provenance: {
        status: 'PROVIDER_VERIFIED',
        provider: 'BINANCE',
        sourceRef: 'https://eapi.binance.com/eapi/v1/exchangeInfo',
        retrievedAt: '2026-11-25T03:00:00Z',
      },
    },
  } as const;
  assert.equal(getContractScaleIssue(canonicalBinanceQuote, 'BINANCE'), undefined);
  assert.equal(hasLegacyScalarAnalyticsCapability(binanceCrypto, 'BINANCE'), true);
  assert.equal(hasLegacyScalarAnalyticsCapability(canonicalBinanceQuote, 'BINANCE'), false);
  assert.equal(hasLegacyScalarAnalyticsCapability(demo, 'DEMO'), true);
});


const canonicalGreekQuote: OptionQuote = {
  id: 'BTC-20261225-100000-C',
  symbol: 'BTC-20261225-100000-C',
  underlying: 'BTC',
  venue: 'BINANCE',
  assetClass: 'CRYPTO',
  underlyingKind: 'SPOT',
  exerciseStyle: 'EUROPEAN',
  settlementStyle: 'CASH',
  quoteAsset: 'USDT',
  settlementAsset: 'USDT',
  contractEconomics: {
    premium: { multiplier: 1, quoteCurrency: 'USDT', priceUnit: 'PER_CONTRACT' },
    exercise: {
      style: 'EUROPEAN',
      settlement: 'CASH',
      settlementCurrency: 'USDT',
      deliverables: [],
      cashSettlement: { formula: 'INTRINSIC_VALUE', reference: 'INDEX', currency: 'USDT', multiplier: 100 },
    },
    provenance: {
      status: 'PROVIDER_VERIFIED',
      provider: 'BINANCE',
      sourceRef: 'https://eapi.binance.com/eapi/v1/exchangeInfo',
      retrievedAt: '2026-11-25T04:00:00Z',
      rawFields: { unit: 100, underlyingType: 'CRYPTO', contractType: 'CRYPTO_OPTIONS' },
    },
  },
  expiry: '2026-12-25T08:00:00.000Z',
  daysToExpiry: 30,
  strike: 100000,
  type: 'CALL',
  bid: 1.2,
  ask: 1.3,
  markPrice: 1.25,
  priceSource: 'MARK',
  bidAskSource: 'BOOK_TICKER',
  iv: 0.5,
  ivStatus: 'OBSERVED',
  delta: 0.5,
  gamma: 0.00001,
  theta: -10,
  vega: 20,
  rho: 5,
  pricingStatus: 'ASSUMED',
  pricingModel: 'BLACK_SCHOLES_CARRY',
  riskFreeRate: 0,
  carryYield: 0,
  openInterest: 100,
  volume: 20,
  spot: 99000,
  unit: 100,
  markIvSource: 'REST_MARK',
  riskFreeRateSource: 'REST_MARK',
  sourceReceivedAt: {
    markIv: '2026-11-25T04:00:00Z',
    riskFreeRate: '2026-11-25T04:00:00Z',
  },
  sourceTimestamps: { index: '2026-11-25T04:00:00Z', bookTicker: '2026-11-25T04:00:00Z' },
};

const canonicalGreekNow = Date.parse('2026-11-25T04:00:05Z');

test('canonical Binance model Greek capability scales per-underlying values by verified contract unit', () => {
  assert.equal(hasCanonicalBinanceModelGreekCapability(canonicalGreekQuote, 'BINANCE', canonicalGreekNow), true);
  assert.equal(hasCanonicalBinanceModelGreekCapability(canonicalGreekQuote, 'CSV', canonicalGreekNow), false);
  assert.equal(hasLegacyScalarAnalyticsCapability(canonicalGreekQuote, 'BINANCE'), false);
});

test('canonical Binance model Greek capability rejects missing provenance, timestamp or estimated model inputs', () => {
  assert.equal(hasCanonicalBinanceModelGreekCapability({
    ...canonicalGreekQuote,
    sourceTimestamps: {},
  }, 'BINANCE', canonicalGreekNow), false);
  assert.equal(hasCanonicalBinanceModelGreekCapability({
    ...canonicalGreekQuote,
    ivStatus: 'ESTIMATED',
  }, 'BINANCE'), false);
  assert.equal(hasCanonicalBinanceModelGreekCapability({
    ...canonicalGreekQuote,
    estimatedFields: ['delta'],
  }, 'BINANCE'), false);
  assert.equal(hasCanonicalBinanceModelGreekCapability({
    ...canonicalGreekQuote,
    estimatedFields: ['riskFreeRate'],
  }, 'BINANCE'), false);
  assert.equal(hasCanonicalBinanceModelGreekCapability({
    ...canonicalGreekQuote,
    sourceReceivedAt: { ...canonicalGreekQuote.sourceReceivedAt, markIv: '2026-11-25T03:00:00Z' },
  }, 'BINANCE'), false);
  assert.equal(hasCanonicalBinanceModelGreekCapability({
    ...canonicalGreekQuote,
    sourceTimestamps: { ...canonicalGreekQuote.sourceTimestamps, bookTicker: '2026-11-25T03:59:40Z' },
  }, 'BINANCE', canonicalGreekNow), false, 'stale BBO must block model Greeks');
  assert.equal(hasCanonicalBinanceModelGreekCapability({
    ...canonicalGreekQuote,
    unit: 10,
  }, 'BINANCE'), false);
  assert.equal(hasCanonicalBinanceModelGreekCapability({
    ...canonicalGreekQuote,
    contractEconomics: {
      ...canonicalGreekQuote.contractEconomics!,
      provenance: { ...canonicalGreekQuote.contractEconomics!.provenance, status: 'USER_ASSERTED' },
    },
  }, 'BINANCE'), false);
});
