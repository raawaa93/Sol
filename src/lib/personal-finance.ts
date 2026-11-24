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
    if (transaction.occurredAt.slice(0, 7) !== period) continue;
    if (transaction.kind === 'TRANSFER') {
      excludedTransfers += 1;
      continue;
    }

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


export type PortfolioAssetClass = 'EQUITY' | 'ETF' | 'CRYPTO' | 'BOND' | 'COMMODITY' | 'OPTION' | 'CASH' | 'OTHER';

export interface PortfolioHolding {
  id: string;
  symbol: string;
  name: string;
  assetClass: PortfolioAssetClass;
  quantity: number;
  averageCost: number;
  marketPrice: number;
  currency: string;
  /** Exchange contract multiplier; use 1 for spot assets and the verified multiplier for listed contracts. */
  contractMultiplier: number;
  quoteSource: string;
  priceObservedAt: string;
}

export interface PortfolioHoldingAnalysis {
  holding: PortfolioHolding;
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number | null;
  reportingMarketValue: number | null;
  reportingCostBasis: number | null;
  reportingUnrealizedPnl: number | null;
  weightPct: number | null;
}

export interface PortfolioSummary {
  reportingCurrency: string;
  complete: boolean;
  missingFxCurrencies: string[];
  marketValue: number | null;
  costBasis: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  holdings: PortfolioHoldingAnalysis[];
  allocations: Array<{ assetClass: PortfolioAssetClass; marketValue: number | null; weightPct: number | null }>;
  concentration: {
    largestHoldingPct: number | null;
    topThreePct: number | null;
    largestAssetClassPct: number | null;
    herfindahlIndex: number | null;
    warnings: Array<'SINGLE_POSITION_OVER_25_PERCENT' | 'TOP_THREE_OVER_60_PERCENT' | 'ASSET_CLASS_OVER_70_PERCENT'>;
  };
}

/** Calculates a holdings snapshot from manually sourced prices. It does not estimate volatility, beta, VaR, or expected returns. */
export function calculatePortfolio(
  holdings: PortfolioHolding[],
  reportingCurrency: string,
  fxRates: FxRate[] = [],
): PortfolioSummary {
  const target = normalizeCurrency(reportingCurrency);
  validateFxRates(fxRates);
  const ids = new Set<string>();
  const symbols = new Set<string>();
  const missing = new Set<string>();
  const classTotals = new Map<PortfolioAssetClass, number>();
  let marketValue = 0;
  let costBasis = 0;

  const analyses = holdings.map((holding): PortfolioHoldingAnalysis => {
    if (!holding.id.trim() || ids.has(holding.id)) throw new Error('Holding IDs must be non-empty and unique');
    ids.add(holding.id);
    const symbol = holding.symbol.trim().toUpperCase();
    if (!/^[A-Z0-9._:-]{1,32}$/.test(symbol)) throw new Error('Holding symbol is invalid');
    if (!holding.name.trim()) throw new Error('Holding name is required');
    if (symbols.has(symbol)) throw new Error(`Duplicate holding symbol: ${symbol}`);
    symbols.add(symbol);
    if (!['EQUITY', 'ETF', 'CRYPTO', 'BOND', 'COMMODITY', 'OPTION', 'CASH', 'OTHER'].includes(holding.assetClass)) {
      throw new Error('Unsupported portfolio asset class');
    }
    assertNonNegativeFinite(holding.quantity, 'Holding quantity');
    if (holding.quantity === 0) throw new Error('Holding quantity must be greater than zero');
    assertNonNegativeFinite(holding.averageCost, 'Average cost');
    assertNonNegativeFinite(holding.marketPrice, 'Market price');
    assertNonNegativeFinite(holding.contractMultiplier, 'Contract multiplier');
    if (holding.contractMultiplier === 0) throw new Error('Contract multiplier must be greater than zero');
    const currency = normalizeCurrency(holding.currency);
    if (!holding.quoteSource.trim()) throw new Error('Quote source is required');
    validTimestamp(holding.priceObservedAt, 'Price observation time');

    const multiplier = holding.quantity * holding.contractMultiplier;
    const nativeMarketValue = multiplier * holding.marketPrice;
    const nativeCostBasis = multiplier * holding.averageCost;
    const nativePnl = nativeMarketValue - nativeCostBasis;
    const marketConversion = getConversion(nativeMarketValue, currency, target, fxRates);
    const costConversion = getConversion(nativeCostBasis, currency, target, fxRates);
    if (!marketConversion || !costConversion) missing.add(currency);
    const convertedMarketValue = marketConversion?.amount ?? null;
    const convertedCostBasis = costConversion?.amount ?? null;
    const convertedPnl = convertedMarketValue === null || convertedCostBasis === null
      ? null : convertedMarketValue - convertedCostBasis;

    if (convertedMarketValue !== null) {
      marketValue += convertedMarketValue;
      classTotals.set(holding.assetClass, (classTotals.get(holding.assetClass) ?? 0) + convertedMarketValue);
    }
    if (convertedCostBasis !== null) costBasis += convertedCostBasis;

    return {
      holding,
      marketValue: nativeMarketValue,
      costBasis: nativeCostBasis,
      unrealizedPnl: nativePnl,
      unrealizedPnlPct: nativeCostBasis > 0 ? (nativePnl / nativeCostBasis) * 100 : null,
      reportingMarketValue: convertedMarketValue,
      reportingCostBasis: convertedCostBasis,
      reportingUnrealizedPnl: convertedPnl,
      weightPct: null,
    };
  });

  const complete = missing.size === 0;
  const convertedTotal = complete ? marketValue : null;
  const convertedCost = complete ? costBasis : null;
  const withWeights = analyses.map((item) => ({
    ...item,
    weightPct: complete && marketValue > 0 && item.reportingMarketValue !== null
      ? (item.reportingMarketValue / marketValue) * 100 : null,
  }));
  const sortedWeights = complete
    ? withWeights.map((item) => item.weightPct ?? 0).sort((a, b) => b - a)
    : [];
  const allocationRows = [...classTotals.entries()].sort(([a], [b]) => a.localeCompare(b));
  const allocations = allocationRows.map(([assetClass, value]) => ({
    assetClass,
    marketValue: complete ? value : null,
    weightPct: complete && marketValue > 0 ? (value / marketValue) * 100 : null,
  }));
  const largestHoldingPct = complete && sortedWeights.length ? sortedWeights[0] : null;
  const topThreePct = complete && sortedWeights.length ? sortedWeights.slice(0, 3).reduce((sum, value) => sum + value, 0) : null;
  const largestAssetClassPct = complete && allocations.length
    ? Math.max(...allocations.map((item) => item.weightPct ?? 0)) : null;
  const herfindahlIndex = complete && marketValue > 0
    ? withWeights.reduce((sum, item) => sum + ((item.weightPct ?? 0) / 100) ** 2, 0) : null;
  const warnings: PortfolioSummary['concentration']['warnings'] = [];
  if (largestHoldingPct !== null && largestHoldingPct > 25) warnings.push('SINGLE_POSITION_OVER_25_PERCENT');
  if (topThreePct !== null && topThreePct > 60) warnings.push('TOP_THREE_OVER_60_PERCENT');
  if (largestAssetClassPct !== null && largestAssetClassPct > 70) warnings.push('ASSET_CLASS_OVER_70_PERCENT');

  return {
    reportingCurrency: target,
    complete,
    missingFxCurrencies: [...missing].sort(),
    marketValue: convertedTotal,
    costBasis: convertedCost,
    unrealizedPnl: complete ? marketValue - costBasis : null,
    unrealizedPnlPct: complete && costBasis > 0 ? ((marketValue - costBasis) / costBasis) * 100 : null,
    holdings: withWeights,
    allocations,
    concentration: { largestHoldingPct, topThreePct, largestAssetClassPct, herfindahlIndex, warnings },
  };
}
