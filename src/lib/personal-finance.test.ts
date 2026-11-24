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
];

test('monthly cash flow filters the month, converts currencies and excludes transfers', () => {
  const result = calculateMonthlyCashFlow(transactions, '2026-11', 'USD', fx);
  assert.equal(result.income, 2000);
  assert.equal(result.expenses, 610);
  assert.equal(result.netCashFlow, 1390);
  assert.equal(result.excludedTransfers, 1);
  assert.equal(result.byCategory.length, 3);
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
});

test('balance and cash-flow dates require ISO timestamps', () => {
  assert.throws(() => calculateNetWorth([{ ...balances[0], asOf: 'Nov 24, 2026' }], 'USD'), /ISO timestamp/);
  assert.throws(() => calculateMonthlyCashFlow([
    { ...transactions[0], occurredAt: 'Nov 1, 2026' },
  ], '2026-11', 'USD'), /ISO timestamp/);
});
