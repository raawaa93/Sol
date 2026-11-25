import assert from 'node:assert/strict';
import test from 'node:test';
import { canCreateCanonicalPaperTrade, closeCanonicalPaperTrade, createCanonicalPaperTrade } from './paper-journal.ts';
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
  sourceReceivedAt: { bidAsk: '2026-11-25T03:00:00Z' },
};

const input = {
  quote,
  sourceMode: 'BINANCE' as const,
  id: 'paper-entry-1',
  createdAt: '2026-11-25T03:01:00Z',
  quantity: 3,
  premiumPrice: 1.3,
  fees: 0.3,
  entryFeesSource: 'USER_ENTERED' as const,
  spotAtEntry: 99000,
};

test('canonical PAPER entry stores independent premium scale and full contract/source snapshot', () => {
  assert.equal(canCreateCanonicalPaperTrade(quote, 'BINANCE'), true);
  const result = createCanonicalPaperTrade(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.premiumDebit, 4.2);
  assert.equal(result.premiumCurrency, 'USDT');
  assert.equal(result.trade.entryPremium, 1.3);
  assert.ok(Math.abs(result.trade.premiumAmountAtEntry! - 3.9) < 1e-9);
  assert.equal(result.trade.premiumMultiplierAtEntry, 1);
  assert.equal(result.trade.priceSourceAtEntry, 'ASK');
  assert.equal(result.trade.bidAskSourceAtEntry, 'BOOK_TICKER');
  assert.equal(result.trade.contractUnitAtEntry, 100);
  assert.equal(result.trade.contractEconomics?.exercise.cashSettlement?.multiplier, 100);
  assert.equal(result.trade.sourceTimestampsAtEntry?.index, '2026-11-25T03:00:00Z');
  assert.equal(result.trade.sourceReceivedAtAtEntry?.bidAsk, '2026-11-25T03:00:00Z');
  assert.equal(result.trade.entryFeesSource, 'USER_ENTERED');
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


const canonicalEntry = createCanonicalPaperTrade(input);
if (!canonicalEntry.ok) throw new Error('PAPER exit tests require a valid canonical entry fixture');
const exitQuote: OptionQuote = {
  ...quote,
  bid: 1.5,
  bidQuantity: 10,
  ask: 1.6,
  askQuantity: 10,
  sourceTimestamps: {
    index: '2026-11-25T03:02:00Z',
    ticker: '2026-11-25T03:02:00Z',
    bookTicker: '2026-11-25T03:02:00Z',
    markPrice: '2026-11-25T03:02:00Z',
  },
};

test('canonical PAPER close uses observed Bid, checks displayed bid size and computes gross and net P&L only with known exit fees', () => {
  const result = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: exitQuote,
    closedAt: '2026-11-25T03:02:01Z',
    exitFees: 0.2,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.trade.exit?.exitPremium, 1.5);
  assert.equal(result.trade.exit?.priceSourceAtExit, 'BID');
  assert.equal(result.trade.exit?.bidAskSourceAtExit, 'BOOK_TICKER');
  assert.equal(result.trade.exit?.bidQuantityAtExit, 10);
  assert.ok(Math.abs(result.grossCredit - 4.5) < 1e-9);
  assert.ok(Math.abs(result.grossPnl - 0.6) < 1e-9);
  assert.ok(Math.abs(result.netPnl! - 0.1) < 1e-9);
});

test('canonical PAPER close omits net P&L when exit fees are unknown', () => {
  const result = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: exitQuote,
    closedAt: '2026-11-25T03:02:01Z',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.netPnl, undefined);
  assert.equal(result.trade.exit?.realizedNetPnl, undefined);
  assert.ok(Math.abs(result.grossPnl - 0.6) < 1e-9);
});

test('canonical PAPER close rejects insufficient displayed Bid size and non-book prices', () => {
  const smallBid = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: { ...exitQuote, bidQuantity: 2 },
    closedAt: '2026-11-25T03:02:01Z',
  });
  assert.equal(smallBid.ok, false);
  if (!smallBid.ok) assert.equal(smallBid.reason, 'INSUFFICIENT_OBSERVED_BID_SIZE_OR_PRICE');

  const markOnly = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: { ...exitQuote, bidAskSource: 'MARK_PRICE' },
    closedAt: '2026-11-25T03:02:01Z',
  });
  assert.equal(markOnly.ok, false);
  if (!markOnly.ok) assert.equal(markOnly.reason, 'INSUFFICIENT_OBSERVED_BID_SIZE_OR_PRICE');
});

test('canonical PAPER close rejects a different contract, stale/future snapshots and post-expiry exits', () => {
  const mismatch = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: { ...exitQuote, strike: 101000 },
    closedAt: '2026-11-25T03:02:01Z',
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.reason, 'PAPER_EXIT_CONTRACT_IDENTITY_OR_TERMS_MISMATCH');

  const stale = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: { ...exitQuote, sourceTimestamps: { ...exitQuote.sourceTimestamps!, bookTicker: '2026-11-25T02:56:00Z' } },
    closedAt: '2026-11-25T03:02:01Z',
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, 'PAPER_EXIT_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const future = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: { ...exitQuote, sourceTimestamps: { ...exitQuote.sourceTimestamps!, index: '2026-11-25T03:03:00Z' } },
    closedAt: '2026-11-25T03:02:01Z',
  });
  assert.equal(future.ok, false);
  if (!future.ok) assert.equal(future.reason, 'PAPER_EXIT_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const expired = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: exitQuote,
    closedAt: '2026-12-25T08:00:00Z',
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.reason, 'PAPER_EXIT_AT_OR_AFTER_EXPIRY');
});

test('canonical PAPER close rejects repeated exits and invalid fee amounts', () => {
  const first = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: exitQuote,
    closedAt: '2026-11-25T03:02:01Z',
    exitFees: 0.2,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const repeated = closeCanonicalPaperTrade({
    trade: first.trade,
    quote: exitQuote,
    closedAt: '2026-11-25T03:02:02Z',
  });
  assert.equal(repeated.ok, false);
  if (!repeated.ok) assert.equal(repeated.reason, 'PAPER_TRADE_ALREADY_CLOSED');

  const invalidFee = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: exitQuote,
    closedAt: '2026-11-25T03:02:01Z',
    exitFees: Number.NaN,
  });
  assert.equal(invalidFee.ok, false);
  if (!invalidFee.ok) assert.equal(invalidFee.reason, 'INVALID_PAPER_EXIT_FEES');
});


test('canonical PAPER entry rejects missing, stale and future local receive clocks', () => {
  const missing = createCanonicalPaperTrade({
    ...input,
    quote: { ...quote, sourceReceivedAt: undefined },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, 'PAPER_ENTRY_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const stale = createCanonicalPaperTrade({
    ...input,
    quote: { ...quote, sourceReceivedAt: { bidAsk: '2026-11-25T02:55:00Z' } },
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, 'PAPER_ENTRY_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const future = createCanonicalPaperTrade({
    ...input,
    quote: { ...quote, sourceReceivedAt: { bidAsk: '2026-11-25T03:02:00Z' } },
  });
  assert.equal(future.ok, false);
  if (!future.ok) assert.equal(future.reason, 'PAPER_ENTRY_MARKET_SNAPSHOT_STALE_OR_FUTURE');
});

test('canonical PAPER close rejects stale or future local receive clocks', () => {
  const stale = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: { ...exitQuote, sourceReceivedAt: { bidAsk: '2026-11-25T02:56:00Z' } },
    closedAt: '2026-11-25T03:02:01Z',
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, 'PAPER_EXIT_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const future = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: { ...exitQuote, sourceReceivedAt: { bidAsk: '2026-11-25T03:03:00Z' } },
    closedAt: '2026-11-25T03:02:01Z',
  });
  assert.equal(future.ok, false);
  if (!future.ok) assert.equal(future.reason, 'PAPER_EXIT_MARKET_SNAPSHOT_STALE_OR_FUTURE');
});


test('canonical PAPER close keeps net P&L unknown when entry fees were not explicitly supplied', () => {
  const noEntryFeeProof = createCanonicalPaperTrade({ ...input, fees: 0, entryFeesSource: undefined });
  assert.equal(noEntryFeeProof.ok, true);
  if (!noEntryFeeProof.ok) return;
  const result = closeCanonicalPaperTrade({
    trade: noEntryFeeProof.trade,
    quote: exitQuote,
    closedAt: '2026-11-25T03:02:01Z',
    exitFees: 0.2,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.trade.exit?.exitFees, 0.2);
  assert.equal(result.trade.exit?.exitCreditAfterFees, 4.3);
  assert.equal(result.trade.exit?.realizedNetPnl, undefined);
  assert.equal(result.netPnl, undefined);
});

test('canonical PAPER close rejects entry snapshots without a persisted receive clock', () => {
  const legacyEntry = { ...canonicalEntry.trade, sourceReceivedAtAtEntry: undefined };
  const result = closeCanonicalPaperTrade({
    trade: legacyEntry,
    quote: exitQuote,
    closedAt: '2026-11-25T03:02:01Z',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'PAPER_ENTRY_SNAPSHOT_NOT_CANONICAL');
});

test('canonical PAPER entry and exit fees cannot exceed Binance published premium cap', () => {
  const entryFeeTooHigh = createCanonicalPaperTrade({ ...input, fees: 0.5, entryFeesSource: 'USER_ENTERED' });
  assert.equal(entryFeeTooHigh.ok, false);
  if (!entryFeeTooHigh.ok) assert.equal(entryFeeTooHigh.reason, 'PAPER_ENTRY_FEE_EXCEEDS_EXCHANGE_CAP');
  const validEntry = createCanonicalPaperTrade({ ...input, fees: 0.3, entryFeesSource: 'USER_ENTERED' });
  assert.equal(validEntry.ok, true);
  if (!validEntry.ok) return;
  const exitFeeTooHigh = closeCanonicalPaperTrade({
    trade: validEntry.trade,
    quote: exitQuote,
    closedAt: '2026-11-25T03:02:01Z',
    exitFees: 0.6,
  });
  assert.equal(exitFeeTooHigh.ok, false);
  if (!exitFeeTooHigh.ok) assert.equal(exitFeeTooHigh.reason, 'PAPER_EXIT_FEE_EXCEEDS_EXCHANGE_CAP');
});


test('canonical PAPER entry rejects a non-zero entry fee without explicit fee provenance', () => {
  const result = createCanonicalPaperTrade({ ...input, entryFeesSource: undefined });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'PAPER_ENTRY_FEE_PROVENANCE_REQUIRED');
});


test('canonical PAPER close rejects a timestamp before entry and an impossible entry receive order', () => {
  const beforeEntry = closeCanonicalPaperTrade({
    trade: canonicalEntry.trade,
    quote: exitQuote,
    closedAt: '2026-11-25T03:00:59Z',
  });
  assert.equal(beforeEntry.ok, false);
  if (!beforeEntry.ok) assert.equal(beforeEntry.reason, 'PAPER_EXIT_TIME_NOT_AFTER_ENTRY');

  const impossibleReceive = closeCanonicalPaperTrade({
    trade: {
      ...canonicalEntry.trade,
      sourceReceivedAtAtEntry: { bidAsk: '2026-11-25T02:59:59Z' },
    },
    quote: exitQuote,
    closedAt: '2026-11-25T03:02:01Z',
  });
  assert.equal(impossibleReceive.ok, false);
  if (!impossibleReceive.ok) assert.equal(impossibleReceive.reason, 'PAPER_ENTRY_SNAPSHOT_NOT_CANONICAL');
});
