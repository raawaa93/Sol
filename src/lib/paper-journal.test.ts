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
  markPrice: 1.25,
  priceSource: 'MARK',
  bidAskSource: 'BOOK_TICKER',
  bidAskSizeUnit: 'CONTRACTS',
  bidQuantity: 10,
  askQuantity: 10,
  takerFeeRate: 0.00024,
  sourceReceivedAt: { bidAsk: '2026-11-25T03:00:01Z' },
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
  createdAt: '2026-11-25T03:00:02Z',
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
  assert.equal(result.premiumDebit, 4.79);
  assert.equal(result.premiumCurrency, 'USDT');
  assert.equal(result.trade.entryPremium, 1.3);
  assert.equal(result.trade.premiumAmountAtEntry, 3.9);
  assert.equal(result.trade.premiumMultiplierAtEntry, 1);
  assert.equal(result.trade.priceSourceAtEntry, 'ASK');
  assert.equal(result.trade.bidAskSourceAtEntry, 'BOOK_TICKER');
  assert.equal(result.trade.contractUnitAtEntry, 100);
  assert.equal(result.trade.contractEconomics?.exercise.cashSettlement?.multiplier, 100);
  assert.equal(result.trade.sourceTimestampsAtEntry?.index, '2026-11-25T03:00:00Z');
  assert.equal(result.trade.status, 'PAPER');
  assert.equal(result.trade.exchangeFeeAtEntry, 0.39);
  assert.equal(result.trade.additionalFeesAtEntry, 0.5);
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

test('canonical PAPER entry rejects mark-price midpoint as a non-executable buy fill', () => {
  const markQuote = {
    ...quote,
    bidAskSource: 'MARK_PRICE' as const,
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
    quote: { ...quote, expiry: '2026-11-25T03:00:01Z' },
  };
  const result = createCanonicalPaperTrade(expired);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'OPTION_EXPIRED_AT_PAPER_ENTRY');
});

test('canonical PAPER entry rejects stale price or index snapshots older than five minutes', () => {
  const stalePrice = {
    ...input,
    createdAt: '2026-11-25T03:00:06Z',
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
        bookTicker: '2026-11-25T03:00:04Z',
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


function createEntry() {
  const result = createCanonicalPaperTrade(input);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Expected a valid canonical PAPER entry');
  return result.trade;
}

function closeFailure(input: Parameters<typeof closeCanonicalPaperTrade>[0]): string {
  const result = closeCanonicalPaperTrade(input);
  assert.equal(result.ok, false);
  return result.ok ? 'UNEXPECTED_SUCCESS' : result.reason;
}

function entryFailure(input: Parameters<typeof createCanonicalPaperTrade>[0]): string {
  const result = createCanonicalPaperTrade(input);
  assert.equal(result.ok, false);
  return result.ok ? 'UNEXPECTED_SUCCESS' : result.reason;
}

function closeQuote(overrides: Partial<OptionQuote> = {}): OptionQuote {
  return {
    ...quote,
    bid: 1.4,
    ask: 1.5,
    bidQuantity: 3,
    askQuantity: 3,
    spot: 99500,
    sourceTimestamps: {
      ...quote.sourceTimestamps,
      bookTicker: '2026-11-25T03:10:00Z',
      index: '2026-11-25T03:10:00Z',
    },
    sourceReceivedAt: { bidAsk: '2026-11-25T03:10:01Z' },
    ...overrides,
  };
}

test('canonical PAPER close sells at fresh sized Bid, calculates exchange fee and records realized P&L', () => {
  const trade = createEntry();
  const result = closeCanonicalPaperTrade({
    trade,
    quote: closeQuote(),
    closedAt: '2026-11-25T03:10:02Z',
    additionalFees: 0.1,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.close.exitPremium, 1.4);
  assert.equal(result.close.exitExchangeFee, 0.42);
  assert.equal(result.close.exitAdditionalFees, 0.1);
  assert.equal(result.close.exitGrossProceeds, 4.2);
  assert.equal(result.close.exitNetProceeds, 3.68);
  assert.equal(result.close.realizedPnl, -1.11);
  assert.equal(result.trade.close?.currency, 'USDT');
});

test('canonical PAPER close rejects stale/future books, insufficient displayed size and expired contracts', () => {
  const trade = createEntry();
  const stale = closeQuote({ sourceReceivedAt: { bidAsk: '2026-11-25T03:00:00Z' } });
  assert.equal(closeFailure({ trade, quote: stale, closedAt: '2026-11-25T03:10:02Z' }), 'PAPER_CLOSE_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const future = closeQuote({
    sourceTimestamps: { ...closeQuote().sourceTimestamps, bookTicker: '2026-11-25T03:11:00Z' },
  });
  assert.equal(closeFailure({ trade, quote: future, closedAt: '2026-11-25T03:10:02Z' }), 'PAPER_CLOSE_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const thin = closeQuote({ bidQuantity: 2 });
  assert.equal(closeFailure({ trade, quote: thin, closedAt: '2026-11-25T03:10:02Z' }), 'INSUFFICIENT_OR_INVALID_BID_FOR_PAPER_CLOSE');

  const nearExpiryQuote = { ...quote, expiry: '2026-11-25T03:10:01Z' };
  const nearExpiryEntry = createCanonicalPaperTrade({ ...input, quote: nearExpiryQuote });
  assert.equal(nearExpiryEntry.ok, true);
  if (!nearExpiryEntry.ok) return;
  const expired = closeQuote({ expiry: '2026-11-25T03:10:01Z' });
  assert.equal(closeFailure({ trade: nearExpiryEntry.trade, quote: expired, closedAt: '2026-11-25T03:10:02Z' }), 'OPTION_EXPIRED_BEFORE_PAPER_CLOSE');
});

test('canonical PAPER close rejects a different contract and midpoint-only legacy entries', () => {
  const trade = createEntry();
  const mismatched = closeQuote({ strike: 101000 });
  assert.equal(closeFailure({ trade, quote: mismatched, closedAt: '2026-11-25T03:10:02Z' }), 'PAPER_CLOSE_CONTRACT_MISMATCH');

  const legacy = { ...trade, priceSourceAtEntry: 'MID' as const };
  assert.equal(closeFailure({ trade: legacy, quote: closeQuote(), closedAt: '2026-11-25T03:10:02Z' }), 'LEGACY_OR_NON_EXECUTABLE_PAPER_ENTRY_CANNOT_BE_CLOSED');
});

test('canonical PAPER close cannot be applied twice', () => {
  const trade = createEntry();
  const closed = closeCanonicalPaperTrade({ trade, quote: closeQuote(), closedAt: '2026-11-25T03:10:02Z' });
  assert.equal(closed.ok, true);
  if (!closed.ok) return;
  assert.equal(closeFailure({ trade: closed.trade, quote: closeQuote(), closedAt: '2026-11-25T03:11:00Z' }), 'PAPER_TRADE_ALREADY_CLOSED_OR_INVALID');
});


test('canonical PAPER entry requires Ask size to cover the full quantity and a receive timestamp', () => {
  assert.equal(entryFailure({ ...input, quantity: 11 }), 'INSUFFICIENT_ASK_SIZE_FOR_PAPER_ENTRY');
  assert.equal(canCreateCanonicalPaperTrade({ ...quote, askQuantity: 0 }, 'BINANCE'), false);
  const missingReceiveTime = { ...quote, sourceReceivedAt: undefined };
  const result = createCanonicalPaperTrade({ ...input, quote: missingReceiveTime });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'PAPER_ENTRY_MARKET_SNAPSHOT_STALE_OR_FUTURE');
});

test('Binance PAPER entry fee uses the symbol taker rate, index, unit and 10 percent premium cap', () => {
  const capped = createCanonicalPaperTrade(input);
  assert.equal(capped.ok, true);
  if (!capped.ok) return;
  assert.equal(capped.trade.exchangeFeeAtEntry, 0.39);
  const uncappedQuote = { ...quote, takerFeeRate: 0.000000001 };
  const uncapped = createCanonicalPaperTrade({ ...input, quote: uncappedQuote });
  assert.equal(uncapped.ok, true);
  if (!uncapped.ok) return;
  assert.equal(uncapped.trade.exchangeFeeAtEntry, 0.0297);
});


test('canonical PAPER close cannot be timestamped before its entry', () => {
  const trade = createEntry();
  const result = closeCanonicalPaperTrade({
    trade,
    quote: closeQuote(),
    closedAt: '2026-11-25T03:00:01Z',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'PAPER_CLOSE_TIME_BEFORE_ENTRY');
});
