import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMonthlyCashFlow, calculateNetWorth } from './personal-finance.ts';
import type { CashFlowTransaction, FinancialBalance, FxRate } from './personal-finance.ts';

const fx: FxRate[] = [
  { baseCurrency: 'EUR', quoteCurrency: 'USD', rate: 1.1, source: 'test-fx', observedAt: '2026-11-24T10:00:00.000Z' },
  { baseCurrency: 'GBP', quoteCurrency: 'USD', rate: 1.25, source: 'test-fx', observedAt: '2026-11-24T10:00:00.000Z' },
];

const balances: FinancialBalance[] = [
  { id: 'cash-usd', kind: 'ASSET', amount: 1000, currency: 'USD', asOf: '2026-11-24T00:00:00.000Z' },
  { id: 'cash-eur', kind: 'ASSET', amount: 500, currency: 'EUR', asOf: '2026-11-24T00:00:00.000Z' },
  { id: 'loan-gbp', kind: 'LIABILITY', amount: 200, currency: 'GBP', asOf: '2026-11-24T00:00:00.000Z' },
];

test('net worth converts assets and liabilities into one reporting currency', () => {
  const result = calculateNetWorth(balances, 'USD', fx);
  assert.equal(result.complete, true);
  assert.equal(result.assets, 1550);
  assert.equal(result.liabilities, 250);
  assert.equal(result.netWorth, 1300);
  assert.equal(result.byCurrency.length, 3);
  assert.equal(result.convertedBalances.find((item) => item.id === 'cash-eur')?.fxSource, 'test-fx');
  assert.equal(result.convertedBalances.find((item) => item.id === 'cash-eur')?.fxObservedAt, '2026-11-24T10:00:00.000Z');
  assert.deepEqual(result.fxUsage.map((item) => item.sourceCurrency), ['EUR', 'GBP']);
});

test('net worth uses inverse FX rates and never silently treats missing FX as zero', () => {
  const inverse = calculateNetWorth([
    { id: 'eur', kind: 'ASSET', amount: 100, currency: 'EUR', asOf: '2026-11-24T00:00:00Z' },
  ], 'USD', [{ baseCurrency: 'USD', quoteCurrency: 'EUR', rate: 0.8, source: 'test', observedAt: '2026-11-24T00:00:00Z' }]);
  assert.equal(inverse.assets, 125);
  const incomplete = calculateNetWorth([
    { id: 'jpy', kind: 'ASSET', amount: 1000, currency: 'JPY', asOf: '2026-11-24T00:00:00Z' },
  ], 'USD');
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.netWorth, null);
  assert.deepEqual(incomplete.missingFxCurrencies, ['JPY']);
});

test('net worth rejects duplicate IDs, negative balances and invalid dates', () => {
  assert.throws(() => calculateNetWorth([balances[0], balances[0]], 'USD', fx), /unique/);
  assert.throws(() => calculateNetWorth([{ ...balances[0], amount: -1 }], 'USD'), /non-negative/);
  assert.throws(() => calculateNetWorth([{ ...balances[0], asOf: 'bad-date' }], 'USD'), /ISO timestamp/);
});

const transactions: CashFlowTransaction[] = [
  { id: 'salary', kind: 'INCOME', amount: 2000, currency: 'USD', occurredAt: '2026-11-01T09:00:00Z', category: 'Salary' },
  { id: 'rent', kind: 'EXPENSE', amount: 500, currency: 'USD', occurredAt: '2026-11-02T09:00:00Z', category: 'Housing' },
  { id: 'eur-expense', kind: 'EXPENSE', amount: 100, currency: 'EUR', occurredAt: '2026-11-03T09:00:00Z', category: 'Food' },
  { id: 'transfer', kind: 'TRANSFER', amount: 300, currency: 'USD', occurredAt: '2026-11-04T09:00:00Z', category: 'Savings' },
  { id: 'last-month', kind: 'INCOME', amount: 999, currency: 'USD', occurredAt: '2026-10-31T23:00:00Z', category: 'Salary' },
  { id: 'old-transfer', kind: 'TRANSFER', amount: 200, currency: 'USD', occurredAt: '2026-10-30T12:00:00Z', category: 'Savings' },
];

test('monthly cash flow filters the month, converts currencies and excludes transfers', () => {
  const result = calculateMonthlyCashFlow(transactions, '2026-11', 'USD', fx);
  assert.equal(result.income, 2000);
  assert.equal(result.expenses, 610);
  assert.equal(result.netCashFlow, 1390);
  assert.equal(result.excludedTransfers, 1);
  assert.equal(result.byCategory.length, 3);
  assert.deepEqual(result.fxUsage.map((item) => item.sourceCurrency), ['EUR']);
});

test('cash flow reports incomplete conversion rather than a misleading total', () => {
  const result = calculateMonthlyCashFlow([
    { id: 'expense', kind: 'EXPENSE', amount: 100, currency: 'JPY', occurredAt: '2026-11-10T00:00:00Z', category: 'Other' },
  ], '2026-11', 'USD');
  assert.equal(result.complete, false);
  assert.equal(result.netCashFlow, null);
  assert.deepEqual(result.missingFxCurrencies, ['JPY']);
});

test('cash flow validates period and transaction identity', () => {
  assert.throws(() => calculateMonthlyCashFlow([], '2026-13', 'USD'), /YYYY-MM/);
  assert.throws(() => calculateMonthlyCashFlow([transactions[0], transactions[0]], '2026-11', 'USD', fx), /unique/);
});

test('FX inputs reject duplicate pairs, zero rates and missing source provenance', () => {
  const duplicate = [...fx, fx[0]];
  assert.throws(() => calculateNetWorth(balances, 'USD', duplicate), /Duplicate FX pair/);
  assert.throws(() => calculateNetWorth(balances, 'USD', [{ ...fx[0], rate: 0 }]), /greater than zero/);
  assert.throws(() => calculateMonthlyCashFlow([], '2026-11', 'USD', [{ ...fx[0], source: ' ' }]), /source is required/);
  assert.throws(() => calculateNetWorth(balances, 'USD', [
    fx[0], { ...fx[0], baseCurrency: 'USD', quoteCurrency: 'EUR', rate: 0.9 },
  ]), /Duplicate FX pair/);
});

test('balance and cash-flow dates require ISO timestamps', () => {
  assert.throws(() => calculateNetWorth([{ ...balances[0], asOf: 'Nov 24, 2026' }], 'USD'), /ISO timestamp/);
  assert.throws(() => calculateMonthlyCashFlow([
    { ...transactions[0], occurredAt: 'Nov 1, 2026' },
  ], '2026-11', 'USD'), /ISO timestamp/);
});


const portfolioHoldings = [
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', assetClass: 'CRYPTO' as const, quantity: 0.5, averageCost: 40000, marketPrice: 60000, currency: 'USD', contractMultiplier: 1, quoteSource: 'manual exchange quote', priceObservedAt: '2026-11-24T12:00:00Z' },
  { id: 'spy', symbol: 'SPY', name: 'S&P 500 ETF', assetClass: 'ETF' as const, quantity: 2, averageCost: 500, marketPrice: 550, currency: 'USD', contractMultiplier: 1, quoteSource: 'manual broker statement', priceObservedAt: '2026-11-24T12:00:00Z' },
  { id: 'eur-bond', symbol: 'EU-BOND', name: 'Euro bond fund', assetClass: 'BOND' as const, quantity: 10, averageCost: 95, marketPrice: 100, currency: 'EUR', contractMultiplier: 1, quoteSource: 'manual statement', priceObservedAt: '2026-11-24T12:00:00Z' },
];

test('portfolio converts holdings, calculates unrealized P&L and asset-class allocation', async () => {
  const { calculatePortfolio } = await import('./personal-finance.ts');
  const result = calculatePortfolio(portfolioHoldings, 'USD', fx);
  assert.equal(result.complete, true);
  assert.equal(result.marketValue, 32200);
  assert.equal(result.costBasis, 22045);
  assert.equal(result.unrealizedPnl, 10155);
  assert.equal(result.holdings.find((item) => item.holding.id === 'btc')?.reportingUnrealizedPnl, 10000);
  assert.equal(result.allocations.find((item) => item.assetClass === 'BOND')?.marketValue, 1100);
  assert.ok((result.concentration.largestHoldingPct ?? 0) > 25);
  assert.ok(result.concentration.warnings.includes('SINGLE_POSITION_OVER_25_PERCENT'));
});

test('portfolio applies verified contract multipliers to listed options economics', async () => {
  const { calculatePortfolio } = await import('./personal-finance.ts');
  const option = {
    id: 'spy-call', symbol: 'SPY-DEC-600-C', name: 'SPY December call', assetClass: 'OPTION' as const,
    quantity: 2, averageCost: 4, marketPrice: 6, currency: 'USD', contractMultiplier: 100,
    quoteSource: 'broker option chain', priceObservedAt: '2026-11-24T12:00:00Z',
  };
  const result = calculatePortfolio([option], 'USD');
  assert.equal(result.marketValue, 1200);
  assert.equal(result.costBasis, 800);
  assert.equal(result.unrealizedPnl, 400);
});

test('portfolio hides consolidated totals and weights when FX coverage is incomplete', async () => {
  const { calculatePortfolio } = await import('./personal-finance.ts');
  const result = calculatePortfolio(portfolioHoldings, 'GBP', []);
  assert.equal(result.complete, false);
  assert.equal(result.marketValue, null);
  assert.equal(result.unrealizedPnl, null);
  assert.deepEqual(result.missingFxCurrencies, ['EUR', 'USD']);
  assert.equal(result.holdings[0].weightPct, null);
});

test('portfolio rejects duplicate IDs and symbols, invalid units and missing quote provenance', async () => {
  const { calculatePortfolio } = await import('./personal-finance.ts');
  assert.throws(() => calculatePortfolio([portfolioHoldings[0], portfolioHoldings[0]], 'USD'), /unique/);
  assert.throws(() => calculatePortfolio([{ ...portfolioHoldings[0], quantity: 0 }], 'USD'), /greater than zero/);
  assert.throws(() => calculatePortfolio([{ ...portfolioHoldings[0], contractMultiplier: 0 }], 'USD'), /greater than zero/);
  assert.throws(() => calculatePortfolio([{ ...portfolioHoldings[0], quoteSource: ' ' }], 'USD'), /Quote source is required/);
  assert.throws(() => calculatePortfolio([{ ...portfolioHoldings[0], priceObservedAt: 'bad-date' }], 'USD'), /ISO timestamp/);
});
