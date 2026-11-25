import assert from 'node:assert/strict';
import test from 'node:test';
import type { PaperTrade } from './types.ts';
import type { CanonicalPaperCloseEvent } from './paper-journal.ts';
import { BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS } from './contract-economics.ts';
import {
  PAPER_CAMPAIGN_CAPITAL,
  PAPER_CAMPAIGN_MAX_LOSS,
  PAPER_CAMPAIGN_PER_TRADE_CAP,
  canAllocatePaperCampaignTrade,
  summarizePaperCampaignBudget,
} from './paper-campaign-budget.ts';

function trade(overrides: Partial<PaperTrade> = {}): PaperTrade {
  return {
    id: 'paper-1',
    createdAt: '2026-11-25T07:00:00.000Z',
    underlying: 'BTC',
    symbol: 'BTC-261225-100000-C',
    type: 'CALL',
    expiry: '2026-12-25T08:00:00.000Z',
    strike: 100000,
    quantity: 1,
    entryPremium: 20,
    fees: 0,
    spotAtEntry: 100000,
    quoteAsset: 'USDT',
    premiumDebitAtEntry: 20,
    premiumCurrencyAtEntry: 'USDT',
    status: 'PAPER',
    ...overrides,
  };
}

const canonicalEconomics = {
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
    retrievedAt: '2026-11-25T07:00:00Z',
    rawFields: { unit: 100, underlyingType: 'CRYPTO', contractType: 'CRYPTO_OPTIONS', quoteAsset: 'USDT', settleAsset: 'USDT' },
    legalTerms: { ...BINANCE_CRYPTO_OPTIONS_LEGAL_TERMS },
  },
};

function canonicalTradeForBudget(): PaperTrade {
  return trade({
    contractEconomics: canonicalEconomics,
    contractVenueAtEntry: 'BINANCE',
    contractAssetClassAtEntry: 'CRYPTO',
    contractUnderlyingKindAtEntry: 'SPOT',
    contractUnitAtEntry: 100,
    premiumMultiplierAtEntry: 1,
    premiumAmountAtEntry: 20,
    premiumDebitAtEntry: 20,
    premiumCurrencyAtEntry: 'USDT',
    sourceTimestampsAtEntry: {
      bookTicker: '2026-11-25T07:00:00Z',
      index: '2026-11-25T07:00:00Z',
    },
    sourceReceivedAtAtEntry: { bidAsk: '2026-11-25T07:00:01Z' },
  });
}

function closeEventForBudget(record: PaperTrade, netPnl: number): CanonicalPaperCloseEvent {
  const grossProceeds = 20 + netPnl;
  return {
    schemaVersion: 1,
    eventType: 'CLOSE',
    id: 'close-' + record.id,
    tradeId: record.id,
    closedAt: '2026-11-25T07:05:00Z',
    quantity: record.quantity,
    exitPremium: grossProceeds,
    exitFees: 0,
    exitFeesSource: 'USER_ENTERED',
    grossProceeds,
    entryDebit: 20,
    netPnl,
    currency: 'USDT',
    spotAtExit: 100000,
    bidAtExit: grossProceeds,
    askAtExit: grossProceeds + 1,
    bidQuantityAtExit: 1,
    bidAskSizeUnitAtExit: 'CONTRACTS',
    bidAskSourceAtExit: 'BOOK_TICKER',
    sourceTimestampsAtExit: { bookTicker: '2026-11-25T07:04:59Z', index: '2026-11-25T07:04:59Z' },
    sourceReceivedAtAtExit: { bidAsk: '2026-11-25T07:04:59.500Z' },
    contractAtExit: {
      symbol: record.symbol,
      underlying: record.underlying,
      type: record.type,
      expiry: record.expiry,
      strike: record.strike,
      venue: 'BINANCE',
      assetClass: 'CRYPTO',
      underlyingKind: 'SPOT',
      unit: 100,
      quoteAsset: 'USDT',
    },
    contractEconomicsAtExit: canonicalEconomics,
  };
}

test('campaign defaults match the 200 capital / 60 total loss / 20 per attempt plan', () => {
  assert.equal(PAPER_CAMPAIGN_CAPITAL, 200);
  assert.equal(PAPER_CAMPAIGN_MAX_LOSS, 60);
  assert.equal(PAPER_CAMPAIGN_PER_TRADE_CAP, 20);
});

test('two 20 USDT entries leave exactly 20 USDT for a third attempt', () => {
  const summary = summarizePaperCampaignBudget([trade(), trade({ id: 'paper-2' })], 'USDT');
  assert.equal(summary.used, 40);
  assert.equal(summary.remaining, 20);
  assert.equal(summary.canAllocate, true);
  assert.deepEqual(canAllocatePaperCampaignTrade(summary, 20, 'USDT'), { ok: true });
  assert.equal(canAllocatePaperCampaignTrade(summary, 20.01, 'USDT').reason, 'PER_TRADE_RISK_CAP_EXCEEDED');
});

test('three 20 USDT entries exhaust the 60 USDT campaign cap', () => {
  const summary = summarizePaperCampaignBudget([
    trade(), trade({ id: 'paper-2' }), trade({ id: 'paper-3' }),
  ], 'USDT');
  assert.equal(summary.used, 60);
  assert.equal(summary.remaining, 0);
  assert.equal(summary.canAllocate, false);
  assert.equal(canAllocatePaperCampaignTrade(summary, 1, 'USDT').reason, 'CAMPAIGN_RISK_CAP_EXCEEDED');
});

test('legacy entries can be reconciled only from explicit premium amount and multiplier', () => {
  const legacy = trade({
    premiumDebitAtEntry: undefined,
    premiumCurrencyAtEntry: undefined,
    premiumAmountAtEntry: 10,
    premiumMultiplierAtEntry: 1,
    fees: 1,
  });
  const summary = summarizePaperCampaignBudget([legacy], 'USDT');
  assert.equal(summary.used, 11);
  assert.equal(summary.unknownEntries, 0);
});

test('unknown legacy risk blocks new campaign allocation instead of assuming unit one', () => {
  const legacy = trade({
    premiumDebitAtEntry: undefined,
    premiumCurrencyAtEntry: undefined,
    premiumAmountAtEntry: undefined,
    premiumMultiplierAtEntry: undefined,
    contractUnitAtEntry: undefined,
  });
  const summary = summarizePaperCampaignBudget([legacy], 'USDT');
  assert.equal(summary.unknownEntries, 1);
  assert.equal(summary.canAllocate, false);
  assert.equal(canAllocatePaperCampaignTrade(summary, 10, 'USDT').reason, 'UNKNOWN_EXISTING_PAPER_RISK');
});

test('mixed currencies and unsupported currencies are blocked without implicit FX conversion', () => {
  const mixed = summarizePaperCampaignBudget([trade({ premiumCurrencyAtEntry: 'USD', quoteAsset: 'USD' })], 'USDT');
  assert.equal(mixed.currencyMismatchEntries, 1);
  assert.equal(canAllocatePaperCampaignTrade(mixed, 10, 'USDT').reason, 'MIXED_EXISTING_PAPER_CURRENCIES');
  const unsupported = summarizePaperCampaignBudget([], 'EUR');
  assert.equal(unsupported.supportedCurrency, false);
  assert.equal(canAllocatePaperCampaignTrade(unsupported, 10, 'EUR').reason, 'UNSUPPORTED_CAMPAIGN_CURRENCY');
});


test('zero or negative stored premium debits are not treated as zero-risk entries', () => {
  const unreconciled = trade({
    premiumDebitAtEntry: 0,
    premiumAmountAtEntry: undefined,
    premiumMultiplierAtEntry: undefined,
    contractUnitAtEntry: undefined,
  });
  const summary = summarizePaperCampaignBudget([unreconciled], 'USDT');
  assert.equal(summary.unknownEntries, 1);
  assert.equal(summary.canAllocate, false);

  const recoverable = trade({
    premiumDebitAtEntry: 0,
    premiumAmountAtEntry: 15,
    premiumMultiplierAtEntry: 1,
    fees: 1,
  });
  const recovered = summarizePaperCampaignBudget([recoverable], 'USDT');
  assert.equal(recovered.used, 16);
  assert.equal(recovered.unknownEntries, 0);
});

test('invalid per-trade caps and malformed campaign summaries fail closed', () => {
  const summary = summarizePaperCampaignBudget([], 'USDT');
  assert.equal(
    canAllocatePaperCampaignTrade(summary, 10, 'USDT', Number.NaN).reason,
    'INVALID_PER_TRADE_CAP',
  );
  assert.equal(
    canAllocatePaperCampaignTrade({ ...summary, remaining: Number.NaN }, 10, 'USDT').reason,
    'INVALID_CAMPAIGN_BUDGET',
  );
});


test('callers cannot raise campaign or per-attempt caps above the approved constants', () => {
  const summary = summarizePaperCampaignBudget([], 'USDT', 100);
  assert.equal(summary.cap, 60);
  assert.equal(
    canAllocatePaperCampaignTrade(summary, 21, 'USDT', 100).reason,
    'PER_TRADE_RISK_CAP_EXCEEDED',
  );
});

test('inconsistent used and remaining values in a campaign summary fail closed', () => {
  const summary = summarizePaperCampaignBudget([], 'USDT');
  assert.equal(
    canAllocatePaperCampaignTrade({ ...summary, used: 55, remaining: 10 }, 5, 'USDT').reason,
    'INVALID_CAMPAIGN_BUDGET',
  );
});


test('closed PAPER positions release open debit but retain realized campaign losses', () => {
  const closedTrade = canonicalTradeForBudget();
  const closed = closeEventForBudget(closedTrade, -5);
  const summary = summarizePaperCampaignBudget([closedTrade], 'USDT', undefined, [closed]);
  assert.equal(summary.used, 5);
  assert.equal(summary.remaining, 55);
  assert.equal(summary.canAllocate, true);
});

test('closed PAPER profits offset campaign losses without creating negative risk usage', () => {
  const closedTrade = canonicalTradeForBudget();
  const closed = closeEventForBudget(closedTrade, 5);
  const summary = summarizePaperCampaignBudget([closedTrade], 'USDT', undefined, [closed]);
  assert.equal(summary.used, 0);
  assert.equal(summary.remaining, 60);
  assert.equal(summary.canAllocate, true);
});

test('orphaned or unreconciled close events block campaign allocation', () => {
  const closedTrade = canonicalTradeForBudget();
  const orphan = closeEventForBudget(closedTrade, -5);
  const summary = summarizePaperCampaignBudget([closedTrade], 'USDT', undefined, [{ ...orphan, tradeId: 'missing-trade' }]);
  assert.equal(summary.unknownEntries, 1);
  assert.equal(summary.canAllocate, false);
});
