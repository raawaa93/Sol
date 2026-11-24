import { getSpreadPct } from './options.ts';
import { isQuoteFieldEstimated } from './quote-quality.ts';
import type { OptionQuote } from './types.ts';

export interface OptionReplayConfig {
  holdingPeriodMs: number;
  maxExitDelayMs: number;
  maxSpreadPct: number;
  /** Fee charged on premium notional for each side; 0.0002 means 0.02%. */
  feeRatePerSide: number;
  quantity: number;
  maxTrades?: number;
}

export interface OptionReplayTrade {
  symbol: string;
  entryTimestamp: string;
  exitTimestamp: string;
  entryAsk: number;
  exitBid: number;
  quantity: number;
  unit: number;
  holdingMs: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  returnOnPremiumPct: number;
}

export interface OptionReplayResult {
  trades: OptionReplayTrade[];
  wins: number;
  losses: number;
  winRate: number | null;
  grossPnl: number;
  fees: number;
  netPnl: number;
  profitFactor: number | null;
  maxDrawdown: number;
  averageHoldingMs: number | null;
  returnOnPremiumPct: number | null;
  skipped: {
    missingTimestamp: number;
    invalidQuote: number;
    invalidUnit: number;
    wideSpread: number;
    noExitSnapshot: number;
  };
}

/**
 * Conservative, timestamp-ordered execution replay for long options.
 *
 * It buys at the observed ask and sells at the observed bid after a fixed
 * holding period. It is an execution baseline, not a signal strategy or a
 * predictive backtest. It requires source timestamps and two-sided quotes,
 * never substitutes import time, mark price, demo data, or model prices.
 */
export function replayLongOptionSnapshots(
  quotes: OptionQuote[],
  config: OptionReplayConfig,
): OptionReplayResult {
  const emptySkipped = {
    missingTimestamp: 0,
    invalidQuote: 0,
    invalidUnit: 0,
    wideSpread: 0,
    noExitSnapshot: 0,
  };
  if (!Number.isFinite(config.holdingPeriodMs) || config.holdingPeriodMs <= 0
    || !Number.isFinite(config.maxExitDelayMs) || config.maxExitDelayMs < 0
    || !Number.isFinite(config.maxSpreadPct) || config.maxSpreadPct < 0 || config.maxSpreadPct > 100
    || !Number.isFinite(config.feeRatePerSide) || config.feeRatePerSide < 0 || config.feeRatePerSide > 0.1
    || !Number.isFinite(config.quantity) || config.quantity <= 0) {
    return {
      trades: [], wins: 0, losses: 0, winRate: null, grossPnl: 0, fees: 0,
      netPnl: 0, profitFactor: null, maxDrawdown: 0, averageHoldingMs: null,
      returnOnPremiumPct: null, skipped: emptySkipped,
    };
  }

  const maxTrades = Number.isFinite(config.maxTrades)
    ? Math.max(1, Math.floor(config.maxTrades ?? 1_000))
    : 1_000;
  const grouped = new Map<string, Array<{ quote: OptionQuote; timestamp: number }>>();
  const skipped = { ...emptySkipped };

  for (const quote of quotes) {
    const timestamp = quote.sourceTimestamp ? Date.parse(quote.sourceTimestamp) : Number.NaN;
    if (!Number.isFinite(timestamp)) {
      skipped.missingTimestamp += 1;
      continue;
    }
    if (!Number.isFinite(quote.unit) || quote.unit <= 0 || isQuoteFieldEstimated(quote, 'unit')) {
      skipped.invalidUnit += 1;
      continue;
    }
    if (!Number.isFinite(quote.bid) || !Number.isFinite(quote.ask)
      || quote.bid <= 0 || quote.ask <= 0 || quote.ask < quote.bid) {
      skipped.invalidQuote += 1;
      continue;
    }
    const spread = getSpreadPct(quote);
    if (!Number.isFinite(spread)) {
      skipped.invalidQuote += 1;
      continue;
    }
    if (spread > config.maxSpreadPct) {
      skipped.wideSpread += 1;
      continue;
    }
    const rows = grouped.get(quote.symbol) ?? [];
    rows.push({ quote, timestamp });
    grouped.set(quote.symbol, rows);
  }

  const trades: OptionReplayTrade[] = [];
  for (const [symbol, rows] of grouped) {
    rows.sort((a, b) => a.timestamp - b.timestamp);
    const uniqueRows = rows.filter((row, index) => index === 0 || row.timestamp !== rows[index - 1].timestamp);
    let index = 0;
    while (index < uniqueRows.length - 1 && trades.length < maxTrades) {
      const entry = uniqueRows[index];
      const targetExitTime = entry.timestamp + config.holdingPeriodMs;
      let exitIndex = index + 1;
      while (exitIndex < uniqueRows.length
        && uniqueRows[exitIndex].timestamp < targetExitTime) exitIndex += 1;

      const exit = uniqueRows[exitIndex];
      if (!exit || exit.timestamp > targetExitTime + config.maxExitDelayMs) {
        skipped.noExitSnapshot += 1;
        index += 1;
        continue;
      }

      const unit = entry.quote.unit;
      const entryNotional = entry.quote.ask * config.quantity * unit;
      const exitNotional = exit.quote.bid * config.quantity * unit;
      const grossPnl = exitNotional - entryNotional;
      const fees = (entryNotional + exitNotional) * config.feeRatePerSide;
      const netPnl = grossPnl - fees;
      const invested = entryNotional + entryNotional * config.feeRatePerSide;
      trades.push({
        symbol,
        entryTimestamp: new Date(entry.timestamp).toISOString(),
        exitTimestamp: new Date(exit.timestamp).toISOString(),
        entryAsk: entry.quote.ask,
        exitBid: exit.quote.bid,
        quantity: config.quantity,
        unit,
        holdingMs: exit.timestamp - entry.timestamp,
        grossPnl,
        fees,
        netPnl,
        returnOnPremiumPct: invested > 0 ? (netPnl / invested) * 100 : 0,
      });
      index = exitIndex + 1;
    }
    if (trades.length >= maxTrades) break;
  }

  const wins = trades.filter((trade) => trade.netPnl > 0).length;
  const losses = trades.filter((trade) => trade.netPnl < 0).length;
  const grossPnl = trades.reduce((sum, trade) => sum + trade.grossPnl, 0);
  const fees = trades.reduce((sum, trade) => sum + trade.fees, 0);
  const netPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossWins = trades.reduce((sum, trade) => sum + Math.max(0, trade.netPnl), 0);
  const grossLosses = trades.reduce((sum, trade) => sum + Math.max(0, -trade.netPnl), 0);
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  trades.forEach((trade) => {
    equity += trade.netPnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  });
  const invested = trades.reduce((sum, trade) => (
    sum + trade.entryAsk * trade.quantity * trade.unit * (1 + config.feeRatePerSide)
  ), 0);

  return {
    trades,
    wins,
    losses,
    winRate: trades.length ? wins / trades.length : null,
    grossPnl,
    fees,
    netPnl,
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : null,
    maxDrawdown,
    averageHoldingMs: trades.length
      ? trades.reduce((sum, trade) => sum + trade.holdingMs, 0) / trades.length
      : null,
    returnOnPremiumPct: invested > 0 ? (netPnl / invested) * 100 : null,
    skipped,
  };
}
