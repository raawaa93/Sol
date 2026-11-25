import { calculatePremiumCash } from './contract-economics-calculations.ts';
import { validateContractEconomics } from './contract-economics.ts';
import type { OptionQuote, PaperTrade, PaperTradeClose } from './types.ts';

export type PaperJournalSourceMode = 'DEMO' | 'CSV' | 'BINANCE';

export interface CanonicalPaperTradeInput {
  quote: OptionQuote;
  sourceMode: PaperJournalSourceMode;
  id: string;
  createdAt: string;
  quantity: number;
  premiumPrice: number;
  fees: number;
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
  const { quote, sourceMode, id, createdAt, quantity, premiumPrice, fees, spotAtEntry } = input;
  if (!canCreateCanonicalPaperTrade(quote, sourceMode)) {
    return { ok: false, reason: 'CANONICAL_PROVIDER_VERIFIED_OBSERVED_PRICE_REQUIRED' };
  }
  if (!id.trim() || !Number.isFinite(Date.parse(createdAt))
    || !Number.isFinite(quantity) || quantity <= 0
    || !Number.isFinite(premiumPrice) || premiumPrice <= 0
    || !Number.isFinite(fees) || fees < 0
    || !Number.isFinite(spotAtEntry) || spotAtEntry <= 0) {
    return { ok: false, reason: 'INVALID_PAPER_ENTRY_INPUT' };
  }
  const createdAtMs = Date.parse(createdAt);
  const expiryMs = Date.parse(quote.expiry);
  const priceSource = getPaperEntryPriceSource(quote);
  const priceTimestamp = priceSource ? getObservedPriceTimestamp(quote, priceSource) : Number.NaN;
  const indexTimestamp = Date.parse(quote.sourceTimestamps?.index ?? '');
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiryMs) || expiryMs <= createdAtMs) {
    return { ok: false, reason: 'OPTION_EXPIRED_AT_PAPER_ENTRY' };
  }
  if (!Number.isFinite(priceTimestamp) || !Number.isFinite(indexTimestamp)
    || priceTimestamp > createdAtMs || indexTimestamp > createdAtMs
    || createdAtMs - priceTimestamp > MAX_PAPER_ENTRY_SOURCE_AGE_MS
    || createdAtMs - indexTimestamp > MAX_PAPER_ENTRY_SOURCE_AGE_MS) {
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
    askQuantityAtEntry: quote.askQuantity,
    askSizeUnitAtEntry: 'CONTRACTS',
    sourceTimestampsAtEntry: quote.sourceTimestamps ? { ...quote.sourceTimestamps } : undefined,
    status: 'PAPER',
  };
  return {
    ok: true,
    trade,
    premiumDebit: debit.value.amount,
    premiumCurrency: debit.value.currency,
  };
}

export interface CanonicalPaperCloseInput {
  trade: PaperTrade;
  quote: OptionQuote;
  closedAt: string;
  exitPremium: number;
  exitFees: number;
}

export type CanonicalPaperCloseResult =
  | { ok: true; trade: PaperTrade; close: PaperTradeClose; realizedPnl: number; currency: string }
  | { ok: false; reason: string };

/**
 * Close a canonical long Binance option against a timestamped, sufficiently
 * sized BOOK_TICKER bid. This is a conservative PAPER estimate, not a promise
 * of a fill; latency, queue position and market impact are not simulated.
 * Fees must be supplied explicitly because Binance rates vary by account and
 * contract; the function never assumes zero fees.
 */
export function createCanonicalPaperClose(input: CanonicalPaperCloseInput): CanonicalPaperCloseResult {
  const { trade, quote, closedAt, exitPremium, exitFees } = input;
  const closedAtMs = Date.parse(closedAt);
  const expiryMs = Date.parse(trade.expiry);
  const bidTimestamp = Date.parse(quote.sourceTimestamps?.bookTicker ?? '');
  const indexTimestamp = Date.parse(quote.sourceTimestamps?.index ?? '');
  const economics = trade.contractEconomics;
  const currentEconomics = quote.contractEconomics;

  if (!economics || !currentEconomics || trade.close) {
    return { ok: false, reason: trade.close ? 'PAPER_TRADE_ALREADY_CLOSED' : 'CANONICAL_CONTRACT_SNAPSHOT_REQUIRED' };
  }
  if (!validateContractEconomics(economics).adapterReady
    || !validateContractEconomics(currentEconomics).adapterReady
    || economics.provenance.status !== 'PROVIDER_VERIFIED'
    || economics.provenance.provider !== 'BINANCE'
    || economics.provenance.sourceRef !== 'https://eapi.binance.com/eapi/v1/exchangeInfo'
    || currentEconomics.provenance.status !== 'PROVIDER_VERIFIED'
    || currentEconomics.provenance.provider !== 'BINANCE'
    || currentEconomics.provenance.sourceRef !== economics.provenance.sourceRef) {
    return { ok: false, reason: 'PROVIDER_VERIFIED_CONTRACT_TERMS_REQUIRED' };
  }
  const sameEconomics = economics.premium.multiplier === currentEconomics.premium.multiplier
    && economics.premium.quoteCurrency === currentEconomics.premium.quoteCurrency
    && economics.premium.priceUnit === currentEconomics.premium.priceUnit
    && economics.exercise.style === currentEconomics.exercise.style
    && economics.exercise.settlement === currentEconomics.exercise.settlement
    && economics.exercise.settlementCurrency === currentEconomics.exercise.settlementCurrency
    && economics.exercise.cashSettlement?.formula === currentEconomics.exercise.cashSettlement?.formula
    && economics.exercise.cashSettlement?.reference === currentEconomics.exercise.cashSettlement?.reference
    && economics.exercise.cashSettlement?.currency === currentEconomics.exercise.cashSettlement?.currency
    && economics.exercise.cashSettlement?.multiplier === currentEconomics.exercise.cashSettlement?.multiplier
    && economics.provenance.rawFields?.unit === currentEconomics.provenance.rawFields?.unit;
  const entryAtMs = Date.parse(trade.createdAt);
  const entryBookTimestamp = Date.parse(trade.sourceTimestampsAtEntry?.bookTicker ?? '');
  const entryIndexTimestamp = Date.parse(trade.sourceTimestampsAtEntry?.index ?? '');
  const entryDebit = calculatePremiumCash({
    economics,
    premiumPrice: trade.entryPremium,
    contracts: trade.quantity,
    fees: trade.fees,
  });
  const entrySnapshotValid = trade.priceSourceAtEntry === 'ASK'
    && trade.bidAskSourceAtEntry === 'BOOK_TICKER'
    && trade.askSizeUnitAtEntry === 'CONTRACTS'
    && Number.isFinite(trade.askQuantityAtEntry) && trade.askQuantityAtEntry! + 1e-9 >= trade.quantity
    && Number.isFinite(entryAtMs)
    && Number.isFinite(entryBookTimestamp)
    && Number.isFinite(entryIndexTimestamp)
    && entryBookTimestamp <= entryAtMs
    && entryIndexTimestamp <= entryAtMs
    && entryAtMs - entryBookTimestamp <= MAX_PAPER_ENTRY_SOURCE_AGE_MS
    && entryAtMs - entryIndexTimestamp <= MAX_PAPER_ENTRY_SOURCE_AGE_MS
    && expiryMs > entryAtMs
    && trade.contractUnitAtEntry === economics.provenance.rawFields?.unit
    && trade.premiumMultiplierAtEntry === economics.premium.multiplier
    && trade.premiumCurrencyAtEntry === economics.premium.quoteCurrency
    && entryDebit.ok
    && Math.abs(entryDebit.value.amount - (trade.premiumDebitAtEntry ?? Number.NaN)) < 1e-8
    && Math.abs(entryDebit.value.premiumAmount - (trade.premiumAmountAtEntry ?? Number.NaN)) < 1e-8;
  if (!entrySnapshotValid) return { ok: false, reason: 'ENTRY_DEBIT_OR_SOURCE_SNAPSHOT_INVALID' };
  const sameContract = quote.venue === trade.contractVenueAtEntry
    && quote.assetClass === trade.contractAssetClassAtEntry
    && quote.underlyingKind === trade.contractUnderlyingKindAtEntry
    && quote.exerciseStyle === economics.exercise.style
    && quote.settlementStyle === economics.exercise.settlement
    && quote.settlementAsset === economics.exercise.settlementCurrency
    && quote.underlying === trade.underlying
    && quote.symbol === trade.symbol
    && quote.type === trade.type
    && quote.expiry === trade.expiry
    && quote.strike === trade.strike
    && quote.unit === trade.contractUnitAtEntry
    && quote.quoteAsset === trade.premiumCurrencyAtEntry
    && quote.unit === trade.contractUnitAtEntry
    && sameEconomics;
  if (!sameContract) return { ok: false, reason: 'EXIT_CONTRACT_IDENTITY_MISMATCH' };

  if (!Number.isFinite(closedAtMs) || !Number.isFinite(expiryMs) || closedAtMs <= Date.parse(trade.createdAt) || closedAtMs >= expiryMs) {
    return { ok: false, reason: 'EXIT_MUST_BE_BEFORE_EXPIRY_AND_AFTER_ENTRY' };
  }
  if (quote.bidAskSource !== 'BOOK_TICKER' || quote.bidAskSizeUnit !== 'CONTRACTS'
    || !Number.isFinite(quote.bid) || quote.bid <= 0
    || !Number.isFinite(quote.ask) || quote.ask < quote.bid
    || !Number.isFinite(quote.bidQuantity) || quote.bidQuantity! + 1e-9 < trade.quantity) {
    return { ok: false, reason: 'INSUFFICIENT_OBSERVED_BID_SIZE' };
  }
  if (!Number.isFinite(exitPremium) || exitPremium <= 0
    || Math.abs(exitPremium - quote.bid) > Math.max(1e-8, quote.bid * 1e-8)) {
    return { ok: false, reason: 'EXIT_PREMIUM_DOES_NOT_MATCH_TIMESTAMPED_BID' };
  }
  if (!Number.isFinite(exitFees) || exitFees < 0
    || !Number.isFinite(trade.premiumDebitAtEntry) || trade.premiumDebitAtEntry! <= 0
    || !trade.premiumCurrencyAtEntry
    || trade.premiumCurrencyAtEntry !== economics.premium.quoteCurrency
    || quote.quoteAsset !== trade.premiumCurrencyAtEntry) {
    return { ok: false, reason: 'EXIT_FEES_OR_ENTRY_DEBIT_UNVERIFIED' };
  }
  if (!Number.isFinite(quote.spot) || quote.spot <= 0
    || !Number.isFinite(bidTimestamp) || !Number.isFinite(indexTimestamp)
    || bidTimestamp > closedAtMs || indexTimestamp > closedAtMs
    || closedAtMs - bidTimestamp > MAX_PAPER_ENTRY_SOURCE_AGE_MS
    || closedAtMs - indexTimestamp > MAX_PAPER_ENTRY_SOURCE_AGE_MS) {
    return { ok: false, reason: 'EXIT_MARKET_SNAPSHOT_STALE_OR_FUTURE' };
  }

  const proceeds = calculatePremiumCash({ economics, premiumPrice: quote.bid, contracts: trade.quantity });
  if (!proceeds.ok) return { ok: false, reason: proceeds.reason };
  if (exitFees > proceeds.value.premiumAmount) return { ok: false, reason: 'EXIT_FEES_OR_ENTRY_DEBIT_UNVERIFIED' };
  const realizedPnl = proceeds.value.premiumAmount - exitFees - trade.premiumDebitAtEntry!;
  if (!Number.isFinite(realizedPnl)) return { ok: false, reason: 'INVALID_REALIZED_PNL' };

  const close: PaperTradeClose = {
    closedAt,
    exitPremium: quote.bid,
    exitPremiumAmount: proceeds.value.premiumAmount,
    exitFees,
    exitFeeCurrency: proceeds.value.currency,
    exitProceeds: proceeds.value.premiumAmount - exitFees,
    exitCurrency: proceeds.value.currency,
    exitSpot: quote.spot,
    exitPriceSource: 'BID',
    exitBidAskSource: 'BOOK_TICKER',
    exitBidQuantity: quote.bidQuantity!,
    exitBidSizeUnit: 'CONTRACTS',
    sourceTimestampsAtExit: quote.sourceTimestamps ? { ...quote.sourceTimestamps } : undefined,
    realizedPnl,
    realizedPnlCurrency: proceeds.value.currency,
  };
  return {
    ok: true,
    trade: { ...trade, close },
    close,
    realizedPnl,
    currency: proceeds.value.currency,
  };
}
