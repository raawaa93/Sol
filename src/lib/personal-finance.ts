export type BalanceKind = 'ASSET' | 'LIABILITY';
export type CashFlowKind = 'INCOME' | 'EXPENSE' | 'TRANSFER';

export interface FinancialBalance {
  id: string;
  kind: BalanceKind;
  amount: number;
  currency: string;
  asOf: string;
}

export interface FxRate {
  /** Number of quote-currency units for one base-currency unit. */
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  source: string;
  observedAt: string;
}

export interface FxUsage {
  sourceCurrency: string;
  reportingCurrency: string;
  rate: number;
  source: string;
  observedAt: string;
}

export interface ConvertedAmount {
  amount: number;
  sourceCurrency: string;
  reportingCurrency: string;
  rate: number;
  rateSource: string;
  rateObservedAt: string | null;
}

export interface NetWorthSummary {
  reportingCurrency: string;
  assets: number | null;
  liabilities: number | null;
  netWorth: number | null;
  complete: boolean;
  missingFxCurrencies: string[];
  byCurrency: Array<{ currency: string; assets: number; liabilities: number; netWorth: number }>;
  convertedBalances: Array<FinancialBalance & { reportingAmount: number | null; fxRate: number | null; fxSource: string | null; fxObservedAt: string | null }>;
  fxUsage: FxUsage[];
}

export interface CashFlowTransaction {
  id: string;
  kind: CashFlowKind;
  amount: number;
  currency: string;
  occurredAt: string;
  category: string;
}

export interface CashFlowSummary {
  period: string;
  reportingCurrency: string;
  income: number | null;
  expenses: number | null;
  netCashFlow: number | null;
  complete: boolean;
  missingFxCurrencies: string[];
  byCategory: Array<{ category: string; kind: 'INCOME' | 'EXPENSE'; amount: number }>;
  excludedTransfers: number;
  fxUsage: FxUsage[];
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,12}$/.test(currency)) throw new Error(`Invalid currency code: ${value}`);
  return currency;
}

function assertNonNegativeFinite(amount: number, label: string): void {
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} must be a finite, non-negative number`);
}

function validTimestamp(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO timestamp`);
  }
}

function validateFxRates(rates: FxRate[]): void {
  const pairs = new Set<string>();
  for (const item of rates) {
    const base = normalizeCurrency(item.baseCurrency);
    const quote = normalizeCurrency(item.quoteCurrency);
    if (base === quote) throw new Error('FX pair currencies must be different');
    const pair = [base, quote].sort().join('/');
    if (pairs.has(pair)) throw new Error(`Duplicate FX pair: ${pair}`);
    pairs.add(pair);
    assertNonNegativeFinite(item.rate, 'FX rate');
    if (item.rate === 0) throw new Error('FX rate must be greater than zero');
    if (!item.source.trim()) throw new Error('FX rate source is required');
    validTimestamp(item.observedAt, 'FX observation time');
  }
}

function getConversion(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: FxRate[],
): ConvertedAmount | null {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) {
    return { amount, sourceCurrency: from, reportingCurrency: to, rate: 1, rateSource: 'IDENTITY', rateObservedAt: null };
  }

  const direct = rates.find((item) => normalizeCurrency(item.baseCurrency) === from
    && normalizeCurrency(item.quoteCurrency) === to);
  if (direct) {
    assertNonNegativeFinite(direct.rate, 'FX rate');
    if (direct.rate === 0) throw new Error('FX rate must be greater than zero');
    validTimestamp(direct.observedAt, 'FX observation time');
    if (!direct.source.trim()) throw new Error('FX rate source is required');
    return { amount: amount * direct.rate, sourceCurrency: from, reportingCurrency: to, rate: direct.rate, rateSource: direct.source, rateObservedAt: direct.observedAt };
  }

  const inverse = rates.find((item) => normalizeCurrency(item.baseCurrency) === to
    && normalizeCurrency(item.quoteCurrency) === from);
  if (inverse) {
    assertNonNegativeFinite(inverse.rate, 'FX rate');
    if (inverse.rate === 0) throw new Error('FX rate must be greater than zero');
    validTimestamp(inverse.observedAt, 'FX observation time');
    if (!inverse.source.trim()) throw new Error('FX rate source is required');
    const rate = 1 / inverse.rate;
    return { amount: amount * rate, sourceCurrency: from, reportingCurrency: to, rate, rateSource: inverse.source, rateObservedAt: inverse.observedAt };
  }

  return null;
}

/** Calculates a balance-sheet snapshot. Missing FX makes the consolidated total unavailable, never zero. */
export function calculateNetWorth(
  balances: FinancialBalance[],
  reportingCurrency: string,
  fxRates: FxRate[] = [],
): NetWorthSummary {
  const target = normalizeCurrency(reportingCurrency);
  validateFxRates(fxRates);
  const ids = new Set<string>();
  const currencyTotals = new Map<string, { assets: number; liabilities: number }>();
  const convertedBalances: NetWorthSummary['convertedBalances'] = [];
  const fxUsage = new Map<string, FxUsage>();
  const missing = new Set<string>();
  let assets = 0;
  let liabilities = 0;

  for (const balance of balances) {
    if (!balance.id.trim() || ids.has(balance.id)) throw new Error('Balance IDs must be non-empty and unique');
    ids.add(balance.id);
    assertNonNegativeFinite(balance.amount, 'Balance amount');
    validTimestamp(balance.asOf, 'Balance date');
    if (balance.kind !== 'ASSET' && balance.kind !== 'LIABILITY') throw new Error('Unsupported balance kind');
    const currency = normalizeCurrency(balance.currency);
    const totals = currencyTotals.get(currency) ?? { assets: 0, liabilities: 0 };
    totals[balance.kind === 'ASSET' ? 'assets' : 'liabilities'] += balance.amount;
    currencyTotals.set(currency, totals);

    const converted = getConversion(balance.amount, currency, target, fxRates);
    if (!converted) missing.add(currency);
    else {
      if (balance.kind === 'ASSET') assets += converted.amount;
      else liabilities += converted.amount;
      if (converted.rateSource !== 'IDENTITY' && converted.rateObservedAt) {
        const key = `${currency}/${target}`;
        fxUsage.set(key, { sourceCurrency: currency, reportingCurrency: target, rate: converted.rate, source: converted.rateSource, observedAt: converted.rateObservedAt });
      }
    }
    convertedBalances.push({
      ...balance,
      reportingAmount: converted?.amount ?? null,
      fxRate: converted?.rate ?? null,
      fxSource: converted && converted.rateSource !== 'IDENTITY' ? converted.rateSource : null,
      fxObservedAt: converted?.rateObservedAt ?? null,
    });
  }

  const complete = missing.size === 0;
  return {
    reportingCurrency: target,
    assets: complete ? assets : null,
    liabilities: complete ? liabilities : null,
    netWorth: complete ? assets - liabilities : null,
    complete,
    missingFxCurrencies: [...missing].sort(),
    byCurrency: [...currencyTotals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, totals]) => ({
      currency, ...totals, netWorth: totals.assets - totals.liabilities,
    })),
    convertedBalances,
    fxUsage: [...fxUsage.values()],
  };
}

/** Summarizes one calendar month. Transfers are excluded to prevent double-counting cash movement. */
export function calculateMonthlyCashFlow(
  transactions: CashFlowTransaction[],
  period: string,
  reportingCurrency: string,
  fxRates: FxRate[] = [],
): CashFlowSummary {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Period must use YYYY-MM format');
  const target = normalizeCurrency(reportingCurrency);
  validateFxRates(fxRates);
  const ids = new Set<string>();
  const missing = new Set<string>();
  const categories = new Map<string, { INCOME: number; EXPENSE: number }>();
  const fxUsage = new Map<string, FxUsage>();
  let income = 0;
  let expenses = 0;
  let excludedTransfers = 0;

  for (const transaction of transactions) {
    if (!transaction.id.trim() || ids.has(transaction.id)) throw new Error('Transaction IDs must be non-empty and unique');
    ids.add(transaction.id);
    assertNonNegativeFinite(transaction.amount, 'Transaction amount');
    validTimestamp(transaction.occurredAt, 'Transaction date');
    if (!['INCOME', 'EXPENSE', 'TRANSFER'].includes(transaction.kind)) throw new Error('Unsupported cash-flow kind');
    if (transaction.kind === 'TRANSFER') {
      excludedTransfers += 1;
      continue;
    }
    if (transaction.occurredAt.slice(0, 7) !== period) continue;

    const currency = normalizeCurrency(transaction.currency);
    const converted = getConversion(transaction.amount, currency, target, fxRates);
    if (!converted) {
      missing.add(currency);
      continue;
    }
    if (converted.rateSource !== 'IDENTITY' && converted.rateObservedAt) {
      const key = `${currency}/${target}`;
      fxUsage.set(key, { sourceCurrency: currency, reportingCurrency: target, rate: converted.rate, source: converted.rateSource, observedAt: converted.rateObservedAt });
    }
    if (!transaction.category.trim()) throw new Error('Cash-flow category is required');
    if (transaction.kind === 'INCOME') income += converted.amount;
    else expenses += converted.amount;
    const key = `${transaction.kind}: ${transaction.category.trim()}`;
    const totals = categories.get(key) ?? { INCOME: 0, EXPENSE: 0 };
    totals[transaction.kind] += converted.amount;
    categories.set(key, totals);
  }

  const complete = missing.size === 0;
  return {
    period,
    reportingCurrency: target,
    income: complete ? income : null,
    expenses: complete ? expenses : null,
    netCashFlow: complete ? income - expenses : null,
    complete,
    missingFxCurrencies: [...missing].sort(),
    byCategory: [...categories.entries()].flatMap(([key, totals]) => {
      const separator = key.indexOf(': ');
      const kind = key.slice(0, separator) as 'INCOME' | 'EXPENSE';
      const category = key.slice(separator + 2);
      return [{ category, kind, amount: totals[kind] }];
    }).sort((a, b) => a.kind.localeCompare(b.kind) || a.category.localeCompare(b.category)),
    excludedTransfers,
    fxUsage: [...fxUsage.values()],
  };
}
