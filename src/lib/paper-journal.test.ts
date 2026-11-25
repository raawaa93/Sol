import assert from 'node:assert/strict';
import test from 'node:test';
import { canCreateCanonicalPaperTrade, createCanonicalPaperTrade, createCanonicalPaperClose } from './paper-journal.ts';
import type { OptionQuote } from './types.ts';
import { BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS } from './contract-economics.ts';

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
    rawFields: { unit: 100, underlyingType: 'CRYPTO', contractType: 'CRYPTO_OPTIONS', quoteAsset: 'USDT', settleAsset: 'USDT' },
    legalTerms: { ...BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS },
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
  bidQuantity: 10,
  askQuantity: 10,
  bidAskSizeUnit: 'CONTRACTS',
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
  premiumPrice: 1.3,
  fees: 0.5,
  spotAtEntry: 99000,
};

test('canonical PAPER entry stores independent premium scale and full contract/source snapshot', () => {
  assert.equal(canCreateCanonicalPaperTrade(quote, 'BINANCE'), true);
  const result = createCanonicalPaperTrade(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.premiumDebit, 4.4);
  assert.equal(result.premiumCurrency, 'USDT');
  assert.equal(result.trade.entryPremium, 1.3);
  assert.ok(Math.abs(result.trade.premiumAmountAtEntry! - 3.9) < 1e-9);
  assert.equal(result.trade.premiumMultiplierAtEntry, 1);
  assert.equal(result.trade.priceSourceAtEntry, 'ASK');
  assert.equal(result.trade.bidAskSourceAtEntry, 'BOOK_TICKER');
  assert.equal(result.trade.contractUnitAtEntry, 100);
  assert.equal(result.trade.contractEconomics?.exercise.cashSettlement?.multiplier, 100);
  assert.equal(result.trade.sourceTimestampsAtEntry?.index, '2026-11-25T03:00:00Z');
  assert.equal(result.trade.status, 'PAPER');
});

test('canonical PAPER entry rejects missing legal contract provenance', () => {
  const missingLegal = {
    ...quote,
    contractEconomics: {
      ...economics,
      provenance: { ...economics.provenance, legalTerms: undefined },
    },
  } as OptionQuote;
  assert.equal(canCreateCanonicalPaperTrade(missingLegal, 'BINANCE'), false);
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
    sourceTimestamps: { ...quote.sourceTimestamps, ticker: undefined },
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

test('canonical PAPER entry rejects markPrice BBO because it has no verified displayed execution size', () => {
  const markQuote = {
    ...quote,
    bidAskSource: 'MARK_PRICE' as const,
    bidAskSizeUnit: undefined,
    sourceTimestamps: { ...quote.sourceTimestamps, markPrice: '2026-11-25T03:00:01Z' },
  };
  assert.equal(canCreateCanonicalPaperTrade(markQuote, 'BINANCE'), false);
});

test('canonical PAPER entry rejects a premium or spot value that does not match the timestamped source', () => {
  assert.equal(createCanonicalPaperTrade({ ...input, premiumPrice: 1.31 }).ok, false);
  assert.equal(createCanonicalPaperTrade({ ...input, spotAtEntry: 99001 }).ok, false);
});

test('canonical PAPER entry rejects invalid quantity, premium, fees and reference price', () => {
  assert.equal(createCanonicalPaperTrade({ ...input, quantity: 0 }).ok, false);
  assert.equal(createCanonicalPaperTrade({ ...input, premiumPrice: 0 }).ok, false);
  assert.equal(createCanonicalPaperTrade({ ...input, fees: -1 }).ok, false);
  assert.equal(createCanonicalPaperTrade({ ...input, spotAtEntry: Number.NaN }).ok, false);
});


test('canonical PAPER entry rejects an option that expired before the recorded entry time', () => {
  const expired = {
    ...input,
    createdAt: '2026-11-25T03:01:00Z',
    quote: { ...quote, expiry: '2026-11-25T03:00:59Z' },
  };
  const result = createCanonicalPaperTrade(expired);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'OPTION_EXPIRED_AT_PAPER_ENTRY');
});

test('canonical PAPER entry rejects stale price or index snapshots older than five minutes', () => {
  const stalePrice = {
    ...input,
    createdAt: '2026-11-25T03:06:00Z',
  };
  const priceResult = createCanonicalPaperTrade(stalePrice);
  assert.equal(priceResult.ok, false);
  if (!priceResult.ok) assert.equal(priceResult.reason, 'PAPER_ENTRY_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const staleIndex = {
    ...input,
    createdAt: '2026-11-25T03:06:00Z',
    quote: {
      ...quote,
      sourceTimestamps: {
        ...quote.sourceTimestamps,
        bookTicker: '2026-11-25T03:05:30Z',
      },
    },
  };
  const indexResult = createCanonicalPaperTrade(staleIndex);
  assert.equal(indexResult.ok, false);
  if (!indexResult.ok) assert.equal(indexResult.reason, 'PAPER_ENTRY_MARKET_SNAPSHOT_STALE_OR_FUTURE');
});

test('canonical PAPER entry rejects future-dated price and index source timestamps', () => {
  const futurePrice = createCanonicalPaperTrade({
    ...input,
    quote: {
      ...quote,
      sourceTimestamps: {
        ...quote.sourceTimestamps,
        bookTicker: '2026-11-25T03:02:00Z',
      },
    },
  });
  assert.equal(futurePrice.ok, false);
  if (!futurePrice.ok) assert.equal(futurePrice.reason, 'PAPER_ENTRY_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const futureIndex = createCanonicalPaperTrade({
    ...input,
    quote: {
      ...quote,
      sourceTimestamps: {
        ...quote.sourceTimestamps,
        index: '2026-11-25T03:02:00Z',
      },
    },
  });
  assert.equal(futureIndex.ok, false);
  if (!futureIndex.ok) assert.equal(futureIndex.reason, 'PAPER_ENTRY_MARKET_SNAPSHOT_STALE_OR_FUTURE');
});


test('canonical PAPER long entry requires sufficient displayed ask size in contract units', () => {
  const tooSmall = createCanonicalPaperTrade({
    ...input,
    quantity: 11,
    quote: { ...quote, askQuantity: 10 },
  });
  assert.equal(tooSmall.ok, false);
  if (!tooSmall.ok) assert.equal(tooSmall.reason, 'INSUFFICIENT_OBSERVED_ASK_SIZE');

  const missingSizeUnit = createCanonicalPaperTrade({
    ...input,
    quote: { ...quote, bidAskSizeUnit: undefined },
  });
  assert.equal(missingSizeUnit.ok, false);
  if (!missingSizeUnit.ok) assert.equal(missingSizeUnit.reason, 'CANONICAL_PROVIDER_VERIFIED_OBSERVED_PRICE_REQUIRED');
});


function makeOpenCanonicalTrade() {
  const result = createCanonicalPaperTrade(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('test fixture must create an open canonical PAPER trade');
  return result.trade;
}

function makeExitQuote(overrides: Partial<OptionQuote> = {}): OptionQuote {
  return {
    ...quote,
    bid: 1.1,
    ask: 1.3,
    bidQuantity: 10,
    askQuantity: 10,
    bidAskSizeUnit: 'CONTRACTS',
    bidAskSource: 'BOOK_TICKER',
    sourceTimestamps: {
      ...quote.sourceTimestamps,
      bookTicker: '2026-11-25T03:02:00Z',
      index: '2026-11-25T03:02:00Z',
    },
    ...overrides,
  };
}

test('canonical PAPER close sells at timestamped Bid and calculates net realized P&L', () => {
  const trade = makeOpenCanonicalTrade();
  const result = createCanonicalPaperClose({
    trade,
    quote: makeExitQuote(),
    closedAt: '2026-11-25T03:03:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.close.exitPriceSource, 'BID');
  assert.equal(result.close.exitBidQuantity, 10);
  assert.equal(result.close.exitBidSizeUnit, 'CONTRACTS');
  assert.equal(result.close.exitFeeCurrency, 'USDT');
  assert.equal(result.close.exitPremium, 1.1);
  assert.ok(Math.abs(result.close.exitPremiumAmount - 3.3) < 1e-9);
  assert.ok(Math.abs(result.close.exitProceeds - 3.2) < 1e-9);
  assert.ok(Math.abs(result.realizedPnl - (-1.2)) < 1e-9);
  assert.equal(result.close.realizedPnlCurrency, 'USDT');
  assert.equal(result.trade.close?.closedAt, '2026-11-25T03:03:00Z');
});

test('canonical PAPER close rejects insufficient displayed Bid size', () => {
  const result = createCanonicalPaperClose({
    trade: makeOpenCanonicalTrade(),
    quote: makeExitQuote({ bidQuantity: 2 }),
    closedAt: '2026-11-25T03:03:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'INSUFFICIENT_OBSERVED_BID_SIZE');
});

test('canonical PAPER close rejects a different contract or a non-book-ticker quote', () => {
  const trade = makeOpenCanonicalTrade();
  const mismatch = createCanonicalPaperClose({
    trade,
    quote: makeExitQuote({ symbol: 'BTC-20261125-100000-C' }),
    closedAt: '2026-11-25T03:03:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.reason, 'EXIT_CONTRACT_IDENTITY_MISMATCH');

  const markQuote = makeExitQuote({ bidAskSource: 'MARK_PRICE', bidAskSizeUnit: undefined });
  const unverified = createCanonicalPaperClose({
    trade,
    quote: markQuote,
    closedAt: '2026-11-25T03:03:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(unverified.ok, false);
  if (!unverified.ok) assert.equal(unverified.reason, 'INSUFFICIENT_OBSERVED_BID_SIZE');
});

test('canonical PAPER close rejects stale, future-dated and post-expiry snapshots', () => {
  const trade = makeOpenCanonicalTrade();
  const stale = createCanonicalPaperClose({
    trade,
    quote: makeExitQuote({ sourceTimestamps: { ...quote.sourceTimestamps, bookTicker: '2026-11-25T02:00:00Z', index: '2026-11-25T03:02:00Z' } }),
    closedAt: '2026-11-25T03:03:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, 'EXIT_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const future = createCanonicalPaperClose({
    trade,
    quote: makeExitQuote({ sourceTimestamps: { ...quote.sourceTimestamps, bookTicker: '2026-11-25T03:04:00Z' } }),
    closedAt: '2026-11-25T03:03:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(future.ok, false);
  if (!future.ok) assert.equal(future.reason, 'EXIT_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const expired = createCanonicalPaperClose({
    trade,
    quote: makeExitQuote(),
    closedAt: '2026-11-25T20:00:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, 'EXIT_MUST_BE_BEFORE_EXPIRY_AND_AFTER_ENTRY');
});

test('canonical PAPER close requires an explicit non-negative exit fee and prevents double close', () => {
  const trade = makeOpenCanonicalTrade();
  const missingFee = createCanonicalPaperClose({
    trade,
    quote: makeExitQuote(),
    closedAt: '2026-11-25T03:03:00Z',
    exitPremium: 1.1,
    exitFees: Number.NaN,
  });
  assert.equal(missingFee.ok, false);
  if (!missingFee.ok) assert.equal(missingFee.reason, 'EXIT_FEES_OR_ENTRY_DEBIT_UNVERIFIED');

  const first = createCanonicalPaperClose({
    trade,
    quote: makeExitQuote(),
    closedAt: '2026-11-25T03:03:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = createCanonicalPaperClose({
    trade: first.trade,
    quote: makeExitQuote(),
    closedAt: '2026-11-25T03:04:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, 'PAPER_TRADE_ALREADY_CLOSED');
});


test('canonical PAPER close revalidates the immutable entry debit and source snapshot', () => {
  const trade = makeOpenCanonicalTrade();
  const corruptedDebit = createCanonicalPaperClose({
    trade: { ...trade, premiumDebitAtEntry: trade.premiumDebitAtEntry! + 1 },
    quote: makeExitQuote(),
    closedAt: '2026-11-25T03:03:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(corruptedDebit.ok, false);
  if (!corruptedDebit.ok) assert.equal(corruptedDebit.reason, 'ENTRY_DEBIT_OR_SOURCE_SNAPSHOT_INVALID');

  const staleEntry = createCanonicalPaperClose({
    trade: {
      ...trade,
      sourceTimestampsAtEntry: {
        ...trade.sourceTimestampsAtEntry,
        bookTicker: '2026-11-25T02:00:00Z',
      },
    },
    quote: makeExitQuote(),
    closedAt: '2026-11-25T03:03:00Z',
    exitPremium: 1.1,
    exitFees: 0.1,
  });
  assert.equal(staleEntry.ok, false);
  if (!staleEntry.ok) assert.equal(staleEntry.reason, 'ENTRY_DEBIT_OR_SOURCE_SNAPSHOT_INVALID');
});
