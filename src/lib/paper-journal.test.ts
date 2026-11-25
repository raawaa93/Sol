import assert from 'node:assert/strict';
import test from 'node:test';
import { canCreateCanonicalPaperTrade, createCanonicalPaperTrade, createCanonicalPaperCloseEvent } from './paper-journal.ts';
import { appendPaperCloseEvent, clearPaperCloseEvents, isCanonicalPaperCloseEvent, loadPaperCloseEvents, PAPER_CLOSE_EVENTS_KEY, PAPER_CLOSE_EVENTS_RECOVERY_KEY } from './paper-journal-events.ts';
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
  sourceReceivedAt: { bidAsk: '2026-11-25T03:00:01Z' },
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


test('canonical PAPER close uses fresh executable Bid and sufficient displayed contract size', () => {
  const entry = createCanonicalPaperTrade(input);
  assert.equal(entry.ok, true);
  if (!entry.ok) return;
  const closeQuote = {
    ...quote,
    bid: 1.2,
    ask: 1.3,
    bidQuantity: 10,
    askQuantity: 10,
    sourceTimestamps: {
      ...quote.sourceTimestamps,
      bookTicker: '2026-11-25T03:01:30Z',
      index: '2026-11-25T03:01:30Z',
    },
    sourceReceivedAt: { bidAsk: '2026-11-25T03:01:31Z' },
  };
  const result = createCanonicalPaperCloseEvent({
    trade: entry.trade,
    quote: closeQuote,
    sourceMode: 'BINANCE',
    id: 'close-1',
    closedAt: '2026-11-25T03:02:00Z',
    exitFees: 0.25,
    spotAtExit: closeQuote.spot,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.event.exitPremium, 1.2);
  assert.equal(result.event.grossProceeds, 3.6);
  assert.equal(result.event.entryDebit, 4.4);
  assert.ok(Math.abs(result.event.netPnl - -1.05) < 1e-9);
  assert.equal(result.event.exitFeesSource, 'USER_ENTERED');
  assert.equal(isCanonicalPaperCloseEvent(result.event), true);
});

test('canonical PAPER close rejects insufficient Bid size, wrong contract and stale/future source clocks', () => {
  const entry = createCanonicalPaperTrade(input);
  assert.equal(entry.ok, true);
  if (!entry.ok) return;
  const baseQuote = {
    ...quote,
    sourceTimestamps: {
      ...quote.sourceTimestamps,
      bookTicker: '2026-11-25T03:01:30Z',
      index: '2026-11-25T03:01:30Z',
    },
    sourceReceivedAt: { bidAsk: '2026-11-25T03:01:31Z' },
  };
  const base = {
    trade: entry.trade,
    quote: baseQuote,
    sourceMode: 'BINANCE' as const,
    id: 'close-reject',
    closedAt: '2026-11-25T03:02:00Z',
    exitFees: 0,
    spotAtExit: baseQuote.spot,
  };
  const lowSize = createCanonicalPaperCloseEvent({ ...base, quote: { ...baseQuote, bidQuantity: 2 } });
  assert.equal(lowSize.ok, false);
  if (!lowSize.ok) assert.equal(lowSize.reason, 'INSUFFICIENT_OBSERVED_BID_SIZE');

  const wrongContract = createCanonicalPaperCloseEvent({ ...base, quote: { ...baseQuote, strike: baseQuote.strike + 100 } });
  assert.equal(wrongContract.ok, false);
  if (!wrongContract.ok) assert.equal(wrongContract.reason, 'PAPER_CLOSE_CONTRACT_IDENTITY_MISMATCH');

  const stale = createCanonicalPaperCloseEvent({
    ...base,
    closedAt: '2026-11-25T03:07:00Z',
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, 'PAPER_CLOSE_MARKET_SNAPSHOT_STALE_OR_FUTURE');

  const future = createCanonicalPaperCloseEvent({
    ...base,
    quote: { ...baseQuote, sourceTimestamps: { ...baseQuote.sourceTimestamps, bookTicker: '2026-11-25T03:02:01Z' } },
  });
  assert.equal(future.ok, false);
  if (!future.ok) assert.equal(future.reason, 'PAPER_CLOSE_MARKET_SNAPSHOT_STALE_OR_FUTURE');
});

test('runtime close-event validation rejects tampered PnL and stale source chronology', () => {
  const entry = createCanonicalPaperTrade(input);
  assert.equal(entry.ok, true);
  if (!entry.ok) return;
  const closeQuote = {
    ...quote,
    sourceTimestamps: {
      ...quote.sourceTimestamps,
      bookTicker: '2026-11-25T03:01:30Z',
      index: '2026-11-25T03:01:30Z',
    },
    sourceReceivedAt: { bidAsk: '2026-11-25T03:01:31Z' },
  };
  const result = createCanonicalPaperCloseEvent({
    trade: entry.trade,
    quote: closeQuote,
    sourceMode: 'BINANCE',
    id: 'close-integrity-1',
    closedAt: '2026-11-25T03:02:00Z',
    exitFees: 0.25,
    spotAtExit: closeQuote.spot,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(isCanonicalPaperCloseEvent({ ...result.event, netPnl: 100 }), false);
  assert.equal(isCanonicalPaperCloseEvent({
    ...result.event,
    sourceTimestampsAtExit: {
      ...result.event.sourceTimestampsAtExit,
      bookTicker: '2026-11-25T03:00:00Z',
    },
  }), false);
});

test('paper close event storage appends once and rejects duplicate trade closures', () => {
  const entry = createCanonicalPaperTrade(input);
  assert.equal(entry.ok, true);
  if (!entry.ok) return;
  const closeQuote = {
    ...quote,
    sourceTimestamps: {
      ...quote.sourceTimestamps,
      bookTicker: '2026-11-25T03:01:30Z',
      index: '2026-11-25T03:01:30Z',
    },
    sourceReceivedAt: { bidAsk: '2026-11-25T03:01:31Z' },
  };
  const close = createCanonicalPaperCloseEvent({
    trade: entry.trade,
    quote: closeQuote,
    sourceMode: 'BINANCE',
    id: 'close-store-1',
    closedAt: '2026-11-25T03:02:00Z',
    exitFees: 0.25,
    spotAtExit: closeQuote.spot,
  });
  assert.equal(close.ok, true);
  if (!close.ok) return;
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const first = appendPaperCloseEvent(storage, close.event);
  assert.equal(first.ok, true);
  const second = appendPaperCloseEvent(storage, close.event);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, 'PAPER_TRADE_ALREADY_CLOSED');
  const loaded = loadPaperCloseEvents(storage);
  assert.equal(loaded.events.length, 1);
  assert.equal(loaded.persistenceBlocked, false);
});

test('paper close event storage quarantines invalid rows before replacing the active event list', () => {
  const values = new Map<string, string>();
  const raw = JSON.stringify([{ eventType: 'CLOSE', id: 'corrupt' }]);
  values.set(PAPER_CLOSE_EVENTS_KEY, raw);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const loaded = loadPaperCloseEvents(storage);
  assert.equal(loaded.rejectedCount, 1);
  assert.equal(loaded.backupAvailable, true);
  assert.equal(loaded.persistenceBlocked, false);
  assert.equal(values.get(PAPER_CLOSE_EVENTS_RECOVERY_KEY), raw);
});


test('explicit PAPER campaign reset removes active close events but preserves recovery bytes', () => {
  const values = new Map<string, string>();
  values.set(PAPER_CLOSE_EVENTS_KEY, '[]');
  values.set(PAPER_CLOSE_EVENTS_RECOVERY_KEY, '{"prior":"backup"}');
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  assert.equal(clearPaperCloseEvents(storage), true);
  assert.equal(values.has(PAPER_CLOSE_EVENTS_KEY), false);
  assert.equal(values.get(PAPER_CLOSE_EVENTS_RECOVERY_KEY), '{"prior":"backup"}');
});
