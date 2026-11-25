import { calculatePremiumCash } from './contract-economics-calculations.ts';
import { validateContractEconomics } from './contract-economics.ts';
import type { OptionQuote, PaperTrade } from './types.ts';

export type PaperJournalSourceMode = 'DEMO' | 'CSV' | 'BINANCE';

export interface CanonicalPaperTradeInput {
  quote: OptionQuote;
  sourceMode: PaperJournalSourceMode;
  id: string;
  createdAt: string;
  quantity: number;
  premiumPrice: number;
  fees: number;
  entryFeesSource?: 'USER_ENTERED';
  spotAtEntry: number;
}

export type CanonicalPaperTradeResult =
  | { ok: true; trade: PaperTrade; premiumDebit: number; premiumCurrency: string }
  | { ok: false; reason: string };

function getPaperEntryPriceSource(quote: OptionQuote): OptionQuote['priceSource'] | undefined {
  // A long option opens at the displayed ask. Only the Binance bookTicker
  // carries an observed executable ask size in an explicit contract unit.
  if (quote.bidAskSource === 'BOOK_TICKER'
    && quote.bid > 0 && quote.ask > 0 && quote.ask >= quote.bid
    && quote.bidAskSizeUnit === 'CONTRACTS'
    && Number.isFinite(quote.askQuantity) && quote.askQuantity! > 0) return 'ASK';
  return undefined;
}

function hasObservedPriceTimestamp(quote: OptionQuote, source: NonNullable<OptionQuote['priceSource']>): boolean {
  const timestamps = quote.sourceTimestamps;
  if (!timestamps) return false;
  const isValidTimestamp = (value: string | undefined) => Boolean(value && Number.isFinite(Date.parse(value)));
  if (source === 'MARK') return isValidTimestamp(timestamps.markPrice);
  if (source === 'LAST') return isValidTimestamp(timestamps.ticker);
  if (source === 'MID' || source === 'BID' || source === 'ASK') {
    if (quote.bidAskSource === 'BOOK_TICKER') return isValidTimestamp(timestamps.bookTicker);
    if (quote.bidAskSource === 'OPTION_TICKER') return isValidTimestamp(timestamps.ticker);
    if (quote.bidAskSource === 'MARK_PRICE') return isValidTimestamp(timestamps.markPrice);
  }
  return false;
}

const MAX_PAPER_ENTRY_SOURCE_AGE_MS = 5 * 60_000;

function getObservedPriceTimestamp(quote: OptionQuote, source: NonNullable<OptionQuote['priceSource']>): number {
  const timestamps = quote.sourceTimestamps;
  if (!timestamps) return Number.NaN;
  if (source === 'MARK') return Date.parse(timestamps.markPrice ?? '');
  if (source === 'LAST') return Date.parse(timestamps.ticker ?? '');
  if (source === 'MID' || source === 'BID' || source === 'ASK') {
    if (quote.bidAskSource === 'BOOK_TICKER') return Date.parse(timestamps.bookTicker ?? '');
    if (quote.bidAskSource === 'OPTION_TICKER') return Date.parse(timestamps.ticker ?? '');
    if (quote.bidAskSource === 'MARK_PRICE') return Date.parse(timestamps.markPrice ?? '');
  }
  return Number.NaN;
}

/**
 * Canonical PAPER entries are audit snapshots, not valuation positions.
 * Only the trusted Binance adapter may create them; CSV provenance is never
 * accepted. The market price must be observed and have a source timestamp.
 */
export function canCreateCanonicalPaperTrade(
  quote: OptionQuote,
  sourceMode: PaperJournalSourceMode,
): boolean {
  const economics = quote.contractEconomics;
  if (sourceMode !== 'BINANCE' || quote.venue !== 'BINANCE' || !economics) return false;
  if (quote.assetClass !== 'CRYPTO' || quote.underlyingKind !== 'SPOT'
    || quote.exerciseStyle !== 'EUROPEAN' || quote.settlementStyle !== 'CASH'
    || !Number.isFinite(quote.unit) || quote.unit <= 0
    || !Number.isFinite(quote.strike) || quote.strike <= 0
    || !Number.isFinite(Date.parse(quote.expiry))) return false;
  if (!validateContractEconomics(economics).adapterReady
    || economics.provenance.status !== 'PROVIDER_VERIFIED'
    || economics.provenance.provider !== 'BINANCE'
    || economics.provenance.sourceRef !== 'https://eapi.binance.com/eapi/v1/exchangeInfo') return false;
  const settlement = economics.exercise.cashSettlement;
  if (economics.premium.priceUnit !== 'PER_CONTRACT'
    || economics.exercise.style !== 'EUROPEAN'
    || economics.exercise.settlement !== 'CASH'
    || !settlement || settlement.reference !== 'INDEX'
    || settlement.currency !== quote.settlementAsset
    || economics.exercise.settlementCurrency !== quote.settlementAsset
    || settlement.multiplier !== quote.unit
    || economics.provenance.rawFields?.unit !== quote.unit) return false;
  const entryPriceSource = getPaperEntryPriceSource(quote);
  if (entryPriceSource !== 'ASK') return false;
  if (!hasObservedPriceTimestamp(quote, entryPriceSource)
    || !quote.sourceTimestamps?.index || !Number.isFinite(Date.parse(quote.sourceTimestamps.index))) return false;
  if (!quote.quoteAsset || quote.quoteAsset !== economics.premium.quoteCurrency) return false;
  return calculatePremiumCash({ economics, premiumPrice: 1, contracts: 1 }).ok;
}

/**
 * Append-only PAPER journal entry constructor. It snapshots canonical contract
 * terms, the independent premium scale and market-source timestamps. It does
 * not calculate Greeks, mark-to-market, exit P&L, EV or replay outcomes.
 */
export function createCanonicalPaperTrade(
  input: CanonicalPaperTradeInput,
): CanonicalPaperTradeResult {
  const { quote, sourceMode, id, createdAt, quantity, premiumPrice, fees, entryFeesSource, spotAtEntry } = input;
  if (!canCreateCanonicalPaperTrade(quote, sourceMode)) {
    return { ok: false, reason: 'CANONICAL_PROVIDER_VERIFIED_OBSERVED_PRICE_REQUIRED' };
  }
  if (!id.trim() || !Number.isFinite(Date.parse(createdAt))
    || !Number.isFinite(quantity) || quantity <= 0
    || !Number.isFinite(premiumPrice) || premiumPrice <= 0
    || !Number.isFinite(fees) || fees < 0
    || (entryFeesSource !== undefined && entryFeesSource !== 'USER_ENTERED')
    || !Number.isFinite(spotAtEntry) || spotAtEntry <= 0) {
    return { ok: false, reason: 'INVALID_PAPER_ENTRY_INPUT' };
  }
  const createdAtMs = Date.parse(createdAt);
  const expiryMs = Date.parse(quote.expiry);
  const priceSource = getPaperEntryPriceSource(quote);
  const priceTimestamp = priceSource ? getObservedPriceTimestamp(quote, priceSource) : Number.NaN;
  const indexTimestamp = Date.parse(quote.sourceTimestamps?.index ?? '');
  const bidAskReceivedAt = Date.parse(quote.sourceReceivedAt?.bidAsk ?? '');
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiryMs) || expiryMs <= createdAtMs) {
    return { ok: false, reason: 'OPTION_EXPIRED_AT_PAPER_ENTRY' };
  }
  if (!Number.isFinite(priceTimestamp) || !Number.isFinite(indexTimestamp) || !Number.isFinite(bidAskReceivedAt)
    || priceTimestamp > createdAtMs || indexTimestamp > createdAtMs || bidAskReceivedAt > createdAtMs
    || createdAtMs - priceTimestamp > MAX_PAPER_ENTRY_SOURCE_AGE_MS
    || createdAtMs - indexTimestamp > MAX_PAPER_ENTRY_SOURCE_AGE_MS
    || createdAtMs - bidAskReceivedAt > MAX_PAPER_ENTRY_SOURCE_AGE_MS) {
    return { ok: false, reason: 'PAPER_ENTRY_MARKET_SNAPSHOT_STALE_OR_FUTURE' };
  }
  if (quote.bidAskSizeUnit !== 'CONTRACTS' || !Number.isFinite(quote.askQuantity)
    || quote.askQuantity! + 1e-9 < quantity) {
    return { ok: false, reason: 'INSUFFICIENT_OBSERVED_ASK_SIZE' };
  }
  const economics = quote.contractEconomics!;
  const observedEntryPrice = quote.ask;
  if (!Number.isFinite(observedEntryPrice) || observedEntryPrice <= 0
    || Math.abs(premiumPrice - observedEntryPrice) > Math.max(1e-8, observedEntryPrice * 1e-8)) {
    return { ok: false, reason: 'ENTRY_PREMIUM_DOES_NOT_MATCH_TIMESTAMPED_MARKET_BASIS' };
  }
  if (Math.abs(spotAtEntry - quote.spot) > Math.max(1e-8, quote.spot * 1e-8)) {
    return { ok: false, reason: 'ENTRY_SPOT_DOES_NOT_MATCH_TIMESTAMPED_INDEX' };
  }
  const debit = calculatePremiumCash({ economics, premiumPrice, contracts: quantity, fees });
  if (!debit.ok) return { ok: false, reason: debit.reason };
  if (entryFeesSource === undefined && fees !== 0) return { ok: false, reason: 'PAPER_ENTRY_FEE_PROVENANCE_REQUIRED' };
  if (entryFeesSource === 'USER_ENTERED' && fees > debit.value.premiumAmount * 0.1 + 1e-9) return { ok: false, reason: 'PAPER_ENTRY_FEE_EXCEEDS_EXCHANGE_CAP' };

  const trade: PaperTrade = {
    id,
    createdAt,
    underlying: quote.underlying,
    symbol: quote.symbol,
    type: quote.type,
    expiry: quote.expiry,
    strike: quote.strike,
    quantity,
    entryPremium: premiumPrice,
    fees,
    ...(entryFeesSource ? { entryFeesSource } : {}),
    spotAtEntry,
    quoteAsset: quote.quoteAsset,
    contractEconomics: {
      premium: { ...economics.premium },
      exercise: {
        ...economics.exercise,
        deliverables: economics.exercise.deliverables.map((item) => ({ ...item })),
        ...(economics.exercise.cashSettlement ? { cashSettlement: { ...economics.exercise.cashSettlement } } : {}),
        ...(economics.exercise.aggregateExerciseCash ? { aggregateExerciseCash: { ...economics.exercise.aggregateExerciseCash } } : {}),
      },
      provenance: { ...economics.provenance, ...(economics.provenance.rawFields ? { rawFields: { ...economics.provenance.rawFields } } : {}) },
    },
    contractVenueAtEntry: quote.venue,
    contractAssetClassAtEntry: quote.assetClass,
    contractUnderlyingKindAtEntry: quote.underlyingKind,
    contractUnitAtEntry: quote.unit,
    premiumMultiplierAtEntry: debit.value.multiplier,
    premiumAmountAtEntry: debit.value.premiumAmount,
    premiumDebitAtEntry: debit.value.amount,
    premiumCurrencyAtEntry: debit.value.currency,
    priceSourceAtEntry: getPaperEntryPriceSource(quote),
    bidAskSourceAtEntry: quote.bidAskSource,
    sourceTimestampsAtEntry: quote.sourceTimestamps ? { ...quote.sourceTimestamps } : undefined,
    sourceReceivedAtAtEntry: quote.sourceReceivedAt?.bidAsk ? { bidAsk: quote.sourceReceivedAt.bidAsk } : undefined,
    status: 'PAPER',
  };
  return {
    ok: true,
    trade,
    premiumDebit: debit.value.amount,
    premiumCurrency: debit.value.currency,
  };
}


export interface CanonicalPaperExitInput {
  trade: PaperTrade;
  quote: OptionQuote;
  closedAt: string;
  /** Exact exit fee in the premium currency. Omit only when the fee is unknown. */
  exitFees?: number;
}

export type CanonicalPaperExitResult =
  | { ok: true; trade: PaperTrade; grossCredit: number; grossPnl: number; netPnl?: number; currency: string }
  | { ok: false; reason: string };

const MAX_PAPER_EXIT_SOURCE_AGE_MS = 5 * 60_000;

/**
 * Close an open canonical long option at the observed executable Bid.
 * This is a conservative PAPER simulation, not a guaranteed exchange fill.
 * Net P&L is deliberately omitted unless the user supplies the exact exit fee.
 */
export function closeCanonicalPaperTrade(input: CanonicalPaperExitInput): CanonicalPaperExitResult {
  const { trade, quote, closedAt, exitFees } = input;
  if (trade.exit) return { ok: false, reason: 'PAPER_TRADE_ALREADY_CLOSED' };
  if (!trade.contractEconomics || trade.contractVenueAtEntry !== 'BINANCE'
    || trade.contractAssetClassAtEntry !== 'CRYPTO'
    || trade.contractUnderlyingKindAtEntry !== 'SPOT'
    || trade.priceSourceAtEntry !== 'ASK'
    || trade.bidAskSourceAtEntry !== 'BOOK_TICKER'
    || !Number.isFinite(trade.contractUnitAtEntry) || trade.contractUnitAtEntry! <= 0
    || !Number.isFinite(trade.premiumMultiplierAtEntry) || trade.premiumMultiplierAtEntry! <= 0
    || !Number.isFinite(trade.premiumAmountAtEntry) || trade.premiumAmountAtEntry! <= 0
    || !Number.isFinite(trade.premiumDebitAtEntry) || trade.premiumDebitAtEntry! < trade.premiumAmountAtEntry!
    || !trade.premiumCurrencyAtEntry
    || !trade.sourceReceivedAtAtEntry?.bidAsk
    || !Number.isFinite(Date.parse(trade.sourceReceivedAtAtEntry.bidAsk))
    || !trade.sourceTimestampsAtEntry?.bookTicker || !Number.isFinite(Date.parse(trade.sourceTimestampsAtEntry.bookTicker))
    || !trade.sourceTimestampsAtEntry?.index || !Number.isFinite(Date.parse(trade.sourceTimestampsAtEntry.index))
    || Date.parse(trade.sourceReceivedAtAtEntry.bidAsk) > Date.parse(trade.createdAt)
    || Date.parse(trade.sourceTimestampsAtEntry.bookTicker) > Date.parse(trade.createdAt)
    || Date.parse(trade.sourceTimestampsAtEntry.index) > Date.parse(trade.createdAt)
    || Date.parse(trade.createdAt) - Date.parse(trade.sourceReceivedAtAtEntry.bidAsk) > MAX_PAPER_ENTRY_SOURCE_AGE_MS
    || Date.parse(trade.createdAt) - Date.parse(trade.sourceTimestampsAtEntry.bookTicker) > MAX_PAPER_ENTRY_SOURCE_AGE_MS
    || Date.parse(trade.createdAt) - Date.parse(trade.sourceTimestampsAtEntry.index) > MAX_PAPER_ENTRY_SOURCE_AGE_MS
    || !validateContractEconomics(trade.contractEconomics).adapterReady) {
    return { ok: false, reason: 'PAPER_ENTRY_SNAPSHOT_NOT_CANONICAL' };
  }
  if (!Number.isFinite(Date.parse(closedAt)) || !Number.isFinite(Date.parse(trade.expiry))
    || Date.parse(closedAt) >= Date.parse(trade.expiry)) {
    return { ok: false, reason: 'PAPER_EXIT_AT_OR_AFTER_EXPIRY' };
  }
  if (quote.venue !== 'BINANCE' || quote.assetClass !== 'CRYPTO' || quote.underlyingKind !== 'SPOT'
    || quote.exerciseStyle !== 'EUROPEAN' || quote.settlementStyle !== 'CASH'
    || quote.symbol !== trade.symbol || quote.underlying !== trade.underlying
    || quote.type !== trade.type || quote.expiry !== trade.expiry
    || quote.strike !== trade.strike || quote.quoteAsset !== trade.quoteAsset
    || quote.settlementAsset !== trade.premiumCurrencyAtEntry
    || quote.unit !== trade.contractUnitAtEntry
    || !quote.contractEconomics
    || !validateContractEconomics(quote.contractEconomics).adapterReady
    || quote.contractEconomics.premium.multiplier !== trade.premiumMultiplierAtEntry
    || quote.contractEconomics.premium.quoteCurrency !== trade.premiumCurrencyAtEntry
    || quote.contractEconomics.exercise.cashSettlement?.multiplier !== trade.contractUnitAtEntry
    || quote.contractEconomics.exercise.cashSettlement?.currency !== trade.premiumCurrencyAtEntry
    || quote.contractEconomics.provenance.provider !== 'BINANCE'
    || quote.contractEconomics.provenance.status !== 'PROVIDER_VERIFIED') {
    return { ok: false, reason: 'PAPER_EXIT_CONTRACT_IDENTITY_OR_TERMS_MISMATCH' };
  }
  if (quote.bidAskSource !== 'BOOK_TICKER' || quote.bidAskSizeUnit !== 'CONTRACTS'
    || !Number.isFinite(quote.bid) || quote.bid <= 0
    || !Number.isFinite(quote.bidQuantity) || quote.bidQuantity! + 1e-9 < trade.quantity) {
    return { ok: false, reason: 'INSUFFICIENT_OBSERVED_BID_SIZE_OR_PRICE' };
  }
  if (exitFees !== undefined && (!Number.isFinite(exitFees) || exitFees < 0)) {
    return { ok: false, reason: 'INVALID_PAPER_EXIT_FEES' };
  }
  const closedAtMs = Date.parse(closedAt);
  const bidTimestamp = Date.parse(quote.sourceTimestamps?.bookTicker ?? '');
  const indexTimestamp = Date.parse(quote.sourceTimestamps?.index ?? '');
  const bidAskReceivedAt = Date.parse(quote.sourceReceivedAt?.bidAsk ?? '');
  if (!Number.isFinite(bidTimestamp) || !Number.isFinite(indexTimestamp) || !Number.isFinite(bidAskReceivedAt)
    || bidTimestamp > closedAtMs || indexTimestamp > closedAtMs || bidAskReceivedAt > closedAtMs
    || closedAtMs - bidTimestamp > MAX_PAPER_EXIT_SOURCE_AGE_MS
    || closedAtMs - indexTimestamp > MAX_PAPER_EXIT_SOURCE_AGE_MS
    || closedAtMs - bidAskReceivedAt > MAX_PAPER_EXIT_SOURCE_AGE_MS
    || !Number.isFinite(quote.spot) || quote.spot <= 0) {
    return { ok: false, reason: 'PAPER_EXIT_MARKET_SNAPSHOT_STALE_OR_FUTURE' };
  }
  const credit = calculatePremiumCash({
    economics: trade.contractEconomics,
    premiumPrice: quote.bid,
    contracts: trade.quantity,
  });
  if (!credit.ok) return { ok: false, reason: credit.reason };
  if (exitFees !== undefined && exitFees > credit.value.premiumAmount * 0.1 + 1e-9) {
    return { ok: false, reason: 'PAPER_EXIT_FEE_EXCEEDS_EXCHANGE_CAP' };
  }
  const grossPnl = credit.value.premiumAmount - trade.premiumAmountAtEntry!;
  if (!Number.isFinite(grossPnl)) return { ok: false, reason: 'INVALID_PAPER_EXIT_VALUE' };
  const hasKnownEntryFees = trade.entryFeesSource === 'USER_ENTERED';
  const hasKnownExitFees = exitFees !== undefined;
  const exit: NonNullable<PaperTrade['exit']> = {
    closedAt,
    exitPremium: quote.bid,
    exitQuantity: trade.quantity,
    ...(exitFees !== undefined ? { exitFees, exitFeesSource: 'USER_ENTERED' as const, exitCreditAfterFees: credit.value.premiumAmount - exitFees } : {}),
    exitPremiumAmount: credit.value.premiumAmount,
    realizedGrossPnl: grossPnl,
    ...(hasKnownEntryFees && hasKnownExitFees ? { realizedNetPnl: credit.value.premiumAmount - exitFees! - trade.premiumDebitAtEntry! } : {}),
    spotAtExit: quote.spot,
    bidQuantityAtExit: quote.bidQuantity!,
    priceSourceAtExit: 'BID',
    bidAskSourceAtExit: 'BOOK_TICKER',
    sourceTimestampsAtExit: { ...quote.sourceTimestamps! },
    sourceReceivedAtAtExit: { bidAsk: quote.sourceReceivedAt!.bidAsk! },
  };
  const updatedTrade = { ...trade, exit };
  return {
    ok: true,
    trade: updatedTrade,
    grossCredit: credit.value.premiumAmount,
    grossPnl,
    ...(exit.realizedNetPnl !== undefined ? { netPnl: exit.realizedNetPnl } : {}),
    currency: credit.value.currency,
  };
}
