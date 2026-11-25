import assert from 'node:assert/strict';
import test from 'node:test';
import { canCreateCanonicalPaperTrade, createCanonicalPaperTrade } from './paper-journal.ts';
import type { OptionQuote } from './types.ts';

const economics = {
  premium: { multiplier: 1, quoteCurrency: 'USDT', priceUnit: 'PER_CONTRACT' as const },
  exercise: {
    style: 'EUROPEAN' as const,
    settlement: 'CASH' as const,
    settlementCurrency: 'USDT',
    deliverables: [],
    cashSettlement: { formula: 'INTRINSIC_VALUE' as const, reference: 'INDEX' as const, currency: 'USDT', multiplier: 100 },
  },
  provenance: {
    status: 'PROVIDER_VERIFIED' as const,
    provider: 'BINANCE',
    sourceRef: 'https://eapi.binance.com/eapi/v1/exchangeInfo',
    retrievedAt: '2026-11-25T03:00:00Z',
    rawFields: { unit: 100, quoteAsset: 'USDT', settleAsset: 'USDT' },
  },
};

const quote: OptionQuote = {
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
  contractEconomics: economics,
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
  delta: 0.5,
  gamma: 0.01,
  theta: -0.1,
  vega: 0.2,
  rho: 0,
  openInterest: 100,
  volume: 20,
  spot: 99000,
  unit: 100,
  sourceTimestamps: {
    index: '2026-11-25T03:00:00Z',
    ticker: '2026-11-25T03:00:00Z',
    bookTicker: '2026-11-25T03:00:00Z',
    markPrice: '2026-11-25T03:00:00Z',
  },
};

const input = {
  quote,
  sourceMode: 'BINANCE' as const,
  id: 'paper-entry-1',
  createdAt: '2026-11-25T03:01:00Z',
  quantity: 3,
  premiumPrice: 1.25,
  fees: 0.5,
  spotAtEntry: 99000,
};

test('canonical PAPER entry stores independent premium scale and full contract/source snapshot', () => {
  assert.equal(canCreateCanonicalPaperTrade(quote, 'BINANCE'), true);
  const result = createCanonicalPaperTrade(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.premiumDebit, 4.25);
  assert.equal(result.premiumCurrency, 'USDT');
  assert.equal(result.trade.entryPremium, 1.25);
  assert.equal(result.trade.premiumAmountAtEntry, 3.75);
  assert.equal(result.trade.premiumMultiplierAtEntry, 1);
  assert.equal(result.trade.priceSourceAtEntry, 'MID');
  assert.equal(result.trade.bidAskSourceAtEntry, 'BOOK_TICKER');
  assert.equal(result.trade.contractUnitAtEntry, 100);
  assert.equal(result.trade.contractEconomics?.exercise.cashSettlement?.multiplier, 100);
  assert.equal(result.trade.sourceTimestampsAtEntry?.index, '2026-11-25T03:00:00Z');
  assert.equal(result.trade.status, 'PAPER');
});

test('canonical PAPER entry rejects CSV provenance even when economics claim Binance', () => {
  assert.equal(canCreateCanonicalPaperTrade(quote, 'CSV'), false);
  assert.equal(createCanonicalPaperTrade({ ...input, sourceMode: 'CSV' }).ok, false);
});

test('canonical PAPER entry rejects user-asserted, model-priced and untimestamped quotes', () => {
  assert.equal(canCreateCanonicalPaperTrade({
    ...quote,
    contractEconomics: { ...economics, provenance: { ...economics.provenance, status: 'USER_ASSERTED' } },
  }, 'BINANCE'), false);
  assert.equal(canCreateCanonicalPaperTrade({ ...quote, bid: 0, ask: 0, priceSource: 'MODEL', estimatedFields: ['markPrice'] }, 'BINANCE'), false);
  assert.equal(canCreateCanonicalPaperTrade({ ...quote, sourceTimestamps: undefined }, 'BINANCE'), false);
  assert.equal(canCreateCanonicalPaperTrade({ ...quote, sourceTimestamps: { ticker: '2026-11-25T03:00:00Z' } }, 'BINANCE'), false);
});

test('canonical PAPER entry rejects a REST 24h ticker closeTime as a bid/ask event timestamp', () => {
  const restQuote = {
    ...quote,
    bidAskSource: undefined,
    sourceTimestamps: {
      index: '2026-11-25T03:00:00Z',
      ticker: '2026-11-25T03:00:00Z',
    },
  };
  assert.equal(canCreateCanonicalPaperTrade(restQuote, 'BINANCE'), false);
});

test('canonical PAPER entry requires the timestamp for the actual observed price source', () => {
  assert.equal(canCreateCanonicalPaperTrade({
    ...quote,
    bidAskSource: 'BOOK_TICKER',
    sourceTimestamps: { index: quote.sourceTimestamps?.index, optionTicker: quote.sourceTimestamps?.optionTicker },
  }, 'BINANCE'), false);
  assert.equal(canCreateCanonicalPaperTrade({
    ...quote,
    bidAskSource: 'OPTION_TICKER',
    sourceTimestamps: { ...quote.sourceTimestamps, optionTicker: undefined },
  }, 'BINANCE'), false);
  assert.equal(canCreateCanonicalPaperTrade({
    ...quote,
    priceSource: 'MODEL',
    bid: 0,
    ask: 0,
    bidAskSource: undefined,
  }, 'BINANCE'), false);
  assert.equal(canCreateCanonicalPaperTrade({
    ...quote,
    bidAskSource: 'BOOK_TICKER',
    sourceTimestamps: { ...quote.sourceTimestamps, index: 'not-a-date' },
  }, 'BINANCE'), false);
});

test('canonical PAPER entry rejects premium and spot values detached from their timestamped sources', () => {
  assert.equal(createCanonicalPaperTrade({ ...input, premiumPrice: 1.31 }).ok, false);
  assert.equal(createCanonicalPaperTrade({ ...input, spotAtEntry: 99001 }).ok, false);
});

test('canonical PAPER entry rejects malformed canonical economics even with provider labels', () => {
  assert.equal(canCreateCanonicalPaperTrade({
    ...quote,
    contractEconomics: {
      ...economics,
      exercise: { ...economics.exercise, cashSettlement: { ...economics.exercise.cashSettlement, multiplier: -100 } },
    },
  }, 'BINANCE'), false);
});

test('canonical PAPER entry rejects invalid quantity, premium, fees and reference price', () => {
  assert.equal(createCanonicalPaperTrade({ ...input, quantity: 0 }).ok, false);
  assert.equal(createCanonicalPaperTrade({ ...input, premiumPrice: 0 }).ok, false);
  assert.equal(createCanonicalPaperTrade({ ...input, fees: -1 }).ok, false);
  assert.equal(createCanonicalPaperTrade({ ...input, spotAtEntry: Number.NaN }).ok, false);
});
