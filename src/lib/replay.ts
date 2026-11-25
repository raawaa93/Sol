import { getSpreadPct } from './options.ts';
import { isQuoteFieldEstimated } from './quote-quality.ts';
import { getContractScaleIssue } from './contract-scale.ts';
import type { OptionQuote } from './types.ts';

function hasSameContractScale(entry: OptionQuote, exit: OptionQuote): boolean {
  const tolerance = Math.max(1e-9, Math.abs(entry.unit) * 1e-9);
  return Number.isFinite(entry.unit)
    && Number.isFinite(exit.unit)
    && Math.abs(entry.unit - exit.unit) <= tolerance
    && entry.contractMultiplier === exit.contractMultiplier
    && entry.quoteAsset === exit.quoteAsset
    && entry.settlementAsset === exit.settlementAsset
    && entry.venue === exit.venue
    && entry.assetClass === exit.assetClass
    && entry.underlyingKind === exit.underlyingKind
    && entry.exerciseStyle === exit.exerciseStyle
    && entry.settlementStyle === exit.settlementStyle
    && entry.bidAskSizeUnit === exit.bidAskSizeUnit;
}

function bidAskSourceTimestamp(quote: OptionQuote): string | undefined {
  if (quote.bidAskSource === 'BOOK_TICKER') return quote.sourceTimestamps?.bookTicker;
  if (quote.bidAskSource === 'OPTION_TICKER') return quote.sourceTimestamps?.optionTicker;
  return undefined;
}

export interface OptionReplayConfig {
  holdingPeriodMs: number;
  maxExitDelayMs: number;
  maxSpreadPct: number;
  /** Fee charged on premium notional for each side; 0.0002 means 0.02%. */
  feeRatePerSide: number;
  /** Quantity is the number of option contracts/lots. */
  quantity: number;
  maxTrades?: number;
  /** Maximum source-event-to-receive delay accepted for a quote. Defaults to five minutes. */
  maxQuoteDelayMs?: number;
  /** Additional adverse slippage applied to each side, in basis points. Defaults to zero. */
  slippageBpsPerSide?: number;
  /** Evaluation clock. Quotes received after this time are rejected. Defaults to current time. */
  asOfTimestamp?: string;
  /** Trusted app mode; never inferred from CSV venue labels. */
  sourceMode?: 'CSV' | 'BINANCE';
}

export interface OptionReplayTrade {
  symbol: string;
  entryTimestamp: string;
  exitTimestamp: string;
  entrySourceTimestamp: string;
  exitSourceTimestamp: string;
  entryAsk: number;
  exitBid: number;
  entryFill: number;
  exitFill: number;
  entryDisplayedSize: number;
  exitDisplayedSize: number;
  bidAskSizeUnit: 'CONTRACTS' | 'UNDERLYING_UNITS';
  slippageCost: number;
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
    invalidBidAskSource: number;
    staleQuote: number;
    estimatedExecutionPrice: number;
    missingDisplayedSize: number;
    invalidSizeUnit: number;
    insufficientDisplayedSize: number;
    invalidQuote: number;
    invalidUnit: number;
    invalidContractScale: number;
    wideSpread: number;
    noExitSnapshot: number;
  };
}

/**
 * Conservative timestamp-ordered execution replay for long options.
 *
 * It buys at the observed ask and sells at the observed bid after a fixed
 * holding period. The execution clock is the local receive/availability time,
 * not the legacy last-trade timestamp or the source event timestamp. It
 * requires an explicit BBO source, source timestamp, receive timestamp,
 * displayed size and size unit. Estimated, mark-only and undersized quotes
 * are rejected. This is an execution baseline, not a predictive strategy.
 */
export function replayLongOptionSnapshots(
  quotes: OptionQuote[],
  config: OptionReplayConfig,
): OptionReplayResult {
  const emptySkipped = {
    missingTimestamp: 0,
    invalidBidAskSource: 0,
    staleQuote: 0,
    estimatedExecutionPrice: 0,
    missingDisplayedSize: 0,
    invalidSizeUnit: 0,
    insufficientDisplayedSize: 0,
    invalidQuote: 0,
    invalidUnit: 0,
    invalidContractScale: 0,
    wideSpread: 0,
    noExitSnapshot: 0,
  };
  const asOfMs = config.asOfTimestamp ? Date.parse(config.asOfTimestamp) : Date.now();
  const maxQuoteDelayMs = config.maxQuoteDelayMs ?? 5 * 60_000;
  const slippageBpsPerSide = config.slippageBpsPerSide ?? 0;
  if (!Number.isFinite(asOfMs)
    || !Number.isFinite(config.holdingPeriodMs) || config.holdingPeriodMs <= 0
    || !Number.isFinite(config.maxExitDelayMs) || config.maxExitDelayMs < 0
    || !Number.isFinite(config.maxSpreadPct) || config.maxSpreadPct < 0 || config.maxSpreadPct > 100
    || !Number.isFinite(config.feeRatePerSide) || config.feeRatePerSide < 0 || config.feeRatePerSide > 0.1
    || !Number.isFinite(config.quantity) || config.quantity <= 0
    || !Number.isFinite(maxQuoteDelayMs) || maxQuoteDelayMs < 0
    || !Number.isFinite(slippageBpsPerSide) || slippageBpsPerSide < 0 || slippageBpsPerSide > 5_000) {
    return {
      trades: [], wins: 0, losses: 0, winRate: null, grossPnl: 0, fees: 0,
      netPnl: 0, profitFactor: null, maxDrawdown: 0, averageHoldingMs: null,
      returnOnPremiumPct: null, skipped: emptySkipped,
    };
  }

  const maxTrades = Number.isFinite(config.maxTrades)
    ? Math.max(1, Math.floor(config.maxTrades ?? 1_000))
    : 1_000;
  const grouped = new Map<string, Array<{ quote: OptionQuote; timestamp: number; sourceTimestamp: number }>>();
  const skipped = { ...emptySkipped };

  for (const quote of quotes) {
    if (quote.bidAskSource !== 'BOOK_TICKER' && quote.bidAskSource !== 'OPTION_TICKER') {
      skipped.invalidBidAskSource += 1;
      continue;
    }
    const sourceTimestamp = bidAskSourceTimestamp(quote) ? Date.parse(bidAskSourceTimestamp(quote)!) : Number.NaN;
    const receivedAt = quote.sourceReceivedAt?.bidAsk ? Date.parse(quote.sourceReceivedAt.bidAsk) : Number.NaN;
    if (!Number.isFinite(sourceTimestamp) || !Number.isFinite(receivedAt)
      || sourceTimestamp > receivedAt || receivedAt > asOfMs || sourceTimestamp > asOfMs) {
      skipped.missingTimestamp += 1;
      continue;
    }
    if (receivedAt - sourceTimestamp > maxQuoteDelayMs) {
      skipped.staleQuote += 1;
      continue;
    }
    if (isQuoteFieldEstimated(quote, 'bid') || isQuoteFieldEstimated(quote, 'ask')) {
      skipped.estimatedExecutionPrice += 1;
      continue;
    }
    if (!Number.isFinite(quote.unit) || quote.unit <= 0 || isQuoteFieldEstimated(quote, 'unit')) {
      skipped.invalidUnit += 1;
      continue;
    }
    if (quote.bidAskSizeUnit !== 'CONTRACTS' && quote.bidAskSizeUnit !== 'UNDERLYING_UNITS') {
      skipped.invalidSizeUnit += 1;
      continue;
    }
    if (!Number.isFinite(quote.bidQuantity) || !Number.isFinite(quote.askQuantity)
      || quote.bidQuantity! <= 0 || quote.askQuantity! <= 0) {
      skipped.missingDisplayedSize += 1;
      continue;
    }
    const requiredSize = quote.bidAskSizeUnit === 'CONTRACTS'
      ? config.quantity
      : config.quantity * quote.unit;
    if (quote.bidQuantity! < requiredSize || quote.askQuantity! < requiredSize) {
      skipped.insufficientDisplayedSize += 1;
      continue;
    }
    // Canonical terms are never replayed through the legacy unit scalar path.
    // A canonical replay adapter must explicitly support premium and settlement scales first.
    if (quote.contractEconomics || getContractScaleIssue(quote, config.sourceMode ?? 'CSV') !== undefined) {
      skipped.invalidContractScale += 1;
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
    rows.push({ quote, timestamp: receivedAt, sourceTimestamp });
    grouped.set(quote.symbol, rows);
  }

  const trades: OptionReplayTrade[] = [];
  for (const [symbol, rows] of grouped) {
    const latestByTimestamp = new Map<number, { quote: OptionQuote; sourceTimestamp: number }>();
    rows.forEach((row) => {
      const previous = latestByTimestamp.get(row.timestamp);
      if (!previous || row.sourceTimestamp > previous.sourceTimestamp) {
        latestByTimestamp.set(row.timestamp, { quote: row.quote, sourceTimestamp: row.sourceTimestamp });
      }
    });
    const uniqueRows = [...latestByTimestamp.entries()]
      .map(([timestamp, row]) => ({ timestamp, quote: row.quote, sourceTimestamp: row.sourceTimestamp }))
      .sort((a, b) => a.timestamp - b.timestamp);
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

      if (!hasSameContractScale(entry.quote, exit.quote)) {
        skipped.invalidContractScale += 1;
        index = exitIndex + 1;
        continue;
      }

      const unit = entry.quote.unit;
      const slippageRate = slippageBpsPerSide / 10_000;
      const entryFill = entry.quote.ask * (1 + slippageRate);
      const exitFill = exit.quote.bid * (1 - slippageRate);
      if (exitFill <= 0) {
        skipped.invalidQuote += 1;
        index = exitIndex + 1;
        continue;
      }
      const entryNotional = entryFill * config.quantity * unit;
      const exitNotional = exitFill * config.quantity * unit;
      const grossPnl = exitNotional - entryNotional;
      const fees = (entryNotional + exitNotional) * config.feeRatePerSide;
      const netPnl = grossPnl - fees;
      const invested = entryNotional + entryNotional * config.feeRatePerSide;
      const slippageCost = ((entryFill - entry.quote.ask) + (exit.quote.bid - exitFill)) * config.quantity * unit;
      trades.push({
        symbol,
        entryTimestamp: new Date(entry.timestamp).toISOString(),
        exitTimestamp: new Date(exit.timestamp).toISOString(),
        entrySourceTimestamp: new Date(entry.sourceTimestamp).toISOString(),
        exitSourceTimestamp: new Date(exit.sourceTimestamp).toISOString(),
        entryAsk: entry.quote.ask,
        exitBid: exit.quote.bid,
        entryFill,
        exitFill,
        entryDisplayedSize: entry.quote.askQuantity!,
        exitDisplayedSize: exit.quote.bidQuantity!,
        bidAskSizeUnit: entry.quote.bidAskSizeUnit!,
        slippageCost,
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

  trades.sort((a, b) => Date.parse(a.entryTimestamp) - Date.parse(b.entryTimestamp));
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
    sum + trade.entryFill * trade.quantity * trade.unit * (1 + config.feeRatePerSide)
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
