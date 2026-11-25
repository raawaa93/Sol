import assert from 'node:assert/strict';
import test from 'node:test';
import type { PaperTrade } from './types.ts';
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


test('closed PAPER trades retain entry allocation and add the explicit exit fee without netting sale proceeds', () => {
  const trade = {
    ...trade(),
    premiumDebitAtEntry: 10,
    premiumCurrencyAtEntry: 'USDT',
    close: {
      closedAt: '2026-11-25T04:00:00Z',
      exitPremium: 1.1,
      exitPremiumAmount: 3.3,
      exitFees: 0.2,
      exitFeeCurrency: 'USDT',
      exitProceeds: 3.1,
      exitCurrency: 'USDT',
      exitSpot: 99000,
      exitPriceSource: 'BID' as const,
      exitBidAskSource: 'BOOK_TICKER' as const,
      exitBidQuantity: 10,
      exitBidSizeUnit: 'CONTRACTS' as const,
      sourceTimestampsAtExit: { bookTicker: '2026-11-25T03:59:00Z', index: '2026-11-25T03:59:00Z' },
      realizedPnl: -6.9,
      realizedPnlCurrency: 'USDT',
    },
  } as PaperTrade;
  const summary = summarizePaperCampaignBudget([trade], 'USDT');
  assert.equal(summary.used, 10.2);
  assert.equal(summary.remaining, 49.8);
});

test('closed PAPER trade with missing or mismatched exit fee currency fails closed', () => {
  const trade = {
    ...baseTrade,
    premiumDebitAtEntry: 10,
    premiumCurrencyAtEntry: 'USDT',
    close: {
      closedAt: '2026-11-25T04:00:00Z',
      exitPremium: 1.1,
      exitPremiumAmount: 3.3,
      exitFees: 0.2,
      exitFeeCurrency: 'BTC',
      exitProceeds: 3.1,
      exitCurrency: 'USDT',
      exitSpot: 99000,
      exitPriceSource: 'BID' as const,
      exitBidAskSource: 'BOOK_TICKER' as const,
      exitBidQuantity: 10,
      exitBidSizeUnit: 'CONTRACTS' as const,
      sourceTimestampsAtExit: { bookTicker: '2026-11-25T03:59:00Z', index: '2026-11-25T03:59:00Z' },
      realizedPnl: -6.9,
      realizedPnlCurrency: 'USDT',
    },
  } as PaperTrade;
  const summary = summarizePaperCampaignBudget([trade], 'USDT');
  assert.equal(summary.unknownEntries, 1);
  assert.equal(summary.canAllocate, false);
});
