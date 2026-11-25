import { calculatePremiumCash } from './contract-economics-calculations.ts';
import { validateContractEconomics } from './contract-economics.ts';
import type { ContractEconomics, OptionQuote, PaperTrade } from './types.ts';

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
  const sourceTimestamp = getObservedPriceTimestamp(quote, entryPriceSource);
  const receivedTimestamp = Date.parse(quote.sourceReceivedAt?.bidAsk ?? '');
  if (!hasObservedPriceTimestamp(quote, entryPriceSource)
    || !Number.isFinite(receivedTimestamp) || receivedTimestamp < sourceTimestamp
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
  const receivedTimestamp = Date.parse(quote.sourceReceivedAt?.bidAsk ?? '');
  const indexTimestamp = Date.parse(quote.sourceTimestamps?.index ?? '');
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(expiryMs) || expiryMs <= createdAtMs) {
    return { ok: false, reason: 'OPTION_EXPIRED_AT_PAPER_ENTRY' };
  }
  if (!Number.isFinite(priceTimestamp) || !Number.isFinite(receivedTimestamp) || !Number.isFinite(indexTimestamp)
    || priceTimestamp > receivedTimestamp || receivedTimestamp > createdAtMs || indexTimestamp > createdAtMs
    || createdAtMs - priceTimestamp > MAX_PAPER_ENTRY_SOURCE_AGE_MS
    || createdAtMs - receivedTimestamp > MAX_PAPER_ENTRY_SOURCE_AGE_MS
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
    sourceReceivedAtAtEntry: quote.sourceReceivedAt ? { ...quote.sourceReceivedAt } : undefined,
    status: 'PAPER',
  };
  return {
    ok: true,
    trade,
    premiumDebit: debit.value.amount,
    premiumCurrency: debit.value.currency,
  };
}


export interface CanonicalPaperCloseEvent {
  schemaVersion: 1;
  eventType: 'CLOSE';
  id: string;
  tradeId: string;
  closedAt: string;
  quantity: number;
  exitPremium: number;
  exitFees: number;
  exitFeesCurrency: string;
  exitFeesSource: 'USER_ENTERED';
  grossProceeds: number;
  entryDebit: number;
  netPnl: number;
  currency: string;
  spotAtExit: number;
  bidAtExit: number;
  askAtExit: number;
  bidQuantityAtExit: number;
  bidAskSizeUnitAtExit: 'CONTRACTS';
  bidAskSourceAtExit: 'BOOK_TICKER';
  sourceTimestampsAtExit: {
    bookTicker: string;
    index: string;
  };
  sourceReceivedAtAtExit: { bidAsk: string };
  contractAtExit: {
    symbol: string;
    underlying: string;
    type: 'CALL' | 'PUT';
    expiry: string;
    strike: number;
    venue: string;
    assetClass: string;
    underlyingKind: string;
    unit: number;
    quoteAsset: string;
  };
  contractEconomicsAtExit: ContractEconomics;
}

export type CanonicalPaperCloseResult =
  | { ok: true; event: CanonicalPaperCloseEvent }
  | { ok: false; reason: string };

const MAX_PAPER_CLOSE_SOURCE_AGE_MS = 5 * 60_000;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function comparableContractEconomics(economics: ContractEconomics): unknown {
  return {
    premium: economics.premium,
    exercise: economics.exercise,
    provenance: {
      status: economics.provenance.status,
      provider: economics.provenance.provider,
      sourceRef: economics.provenance.sourceRef,
      rawFields: {
        unit: economics.provenance.rawFields?.unit,
        underlyingType: economics.provenance.rawFields?.underlyingType,
        contractType: economics.provenance.rawFields?.contractType,
        quoteAsset: economics.provenance.rawFields?.quoteAsset,
        settleAsset: economics.provenance.rawFields?.settleAsset,
      },
    },
  };
}

function sameContractAtExit(trade: PaperTrade, quote: OptionQuote): boolean {
  return trade.symbol === quote.symbol
    && trade.underlying === quote.underlying
    && trade.type === quote.type
    && trade.expiry === quote.expiry
    && trade.strike === quote.strike
    && trade.contractVenueAtEntry === quote.venue
    && trade.contractAssetClassAtEntry === quote.assetClass
    && trade.contractUnderlyingKindAtEntry === quote.underlyingKind
    && trade.contractUnitAtEntry === quote.unit
    && trade.quoteAsset === quote.quoteAsset
    && trade.contractEconomics !== undefined
    && quote.contractEconomics !== undefined
    && stableJson(comparableContractEconomics(trade.contractEconomics))
      === stableJson(comparableContractEconomics(quote.contractEconomics));
}

/**
 * Creates an early-close PAPER event for a long Binance option. It uses the
 * observed Bid and displayed contract size; it never treats Mark/Mid/Last as
 * an executable exit. Fees are explicitly user-entered because account/VIP
 * fee schedules are not guaranteed by the public quote snapshot.
 */
export function createCanonicalPaperCloseEvent(input: {
  trade: PaperTrade;
  quote: OptionQuote;
  sourceMode: PaperJournalSourceMode;
  id: string;
  closedAt: string;
  exitFees: number;
  spotAtExit: number;
}): CanonicalPaperCloseResult {
  const { trade, quote, sourceMode, id, closedAt, exitFees, spotAtExit } = input;
  if (sourceMode !== 'BINANCE' || quote.venue !== 'BINANCE'
    || quote.assetClass !== 'CRYPTO' || quote.underlyingKind !== 'SPOT'
    || quote.exerciseStyle !== 'EUROPEAN' || quote.settlementStyle !== 'CASH'
    || !Number.isFinite(quote.unit) || quote.unit <= 0
    || quote.bidAskSource !== 'BOOK_TICKER'
    || quote.bidAskSizeUnit !== 'CONTRACTS'
    || !Number.isFinite(quote.bid) || quote.bid <= 0
    || !Number.isFinite(quote.ask) || quote.ask < quote.bid
    || !Number.isFinite(quote.bidQuantity) || quote.bidQuantity! <= 0) {
    return { ok: false, reason: 'CANONICAL_EXECUTABLE_BID_REQUIRED' };
  }
  if (!sameContractAtExit(trade, quote)) {
    return { ok: false, reason: 'PAPER_CLOSE_CONTRACT_IDENTITY_MISMATCH' };
  }
  if (trade.priceSourceAtEntry !== 'ASK' || trade.bidAskSourceAtEntry !== 'BOOK_TICKER'
    || trade.askSizeUnitAtEntry !== 'CONTRACTS'
    || !Number.isFinite(trade.askQuantityAtEntry) || trade.askQuantityAtEntry! + 1e-9 < trade.quantity) {
    return { ok: false, reason: 'PAPER_ENTRY_ASK_DEPTH_SNAPSHOT_INVALID' };
  }
  if (!id.trim() || !Number.isFinite(Date.parse(closedAt))
    || !Number.isFinite(exitFees) || exitFees < 0
    || !Number.isFinite(spotAtExit) || spotAtExit <= 0
    || !Number.isFinite(trade.quantity) || trade.quantity <= 0
    || trade.status !== 'PAPER') {
    return { ok: false, reason: 'INVALID_PAPER_CLOSE_INPUT' };
  }
  const closedAtMs = Date.parse(closedAt);
  const expiryMs = Date.parse(trade.expiry);
  const bookTimestamp = Date.parse(quote.sourceTimestamps?.bookTicker ?? '');
  const receivedTimestamp = Date.parse(quote.sourceReceivedAt?.bidAsk ?? '');
  const indexTimestamp = Date.parse(quote.sourceTimestamps?.index ?? '');
  if (!Number.isFinite(expiryMs) || expiryMs <= closedAtMs) {
    return { ok: false, reason: 'OPTION_EXPIRED_AT_PAPER_CLOSE' };
  }
  if (!Number.isFinite(bookTimestamp) || !Number.isFinite(receivedTimestamp) || !Number.isFinite(indexTimestamp)
    || bookTimestamp > receivedTimestamp || receivedTimestamp > closedAtMs || indexTimestamp > closedAtMs
    || receivedTimestamp - bookTimestamp > MAX_PAPER_CLOSE_SOURCE_AGE_MS
    || closedAtMs - receivedTimestamp > MAX_PAPER_CLOSE_SOURCE_AGE_MS
    || closedAtMs - bookTimestamp > MAX_PAPER_CLOSE_SOURCE_AGE_MS
    || closedAtMs - indexTimestamp > MAX_PAPER_CLOSE_SOURCE_AGE_MS) {
    return { ok: false, reason: 'PAPER_CLOSE_MARKET_SNAPSHOT_STALE_OR_FUTURE' };
  }
  if (quote.bidQuantity! + 1e-9 < trade.quantity) {
    return { ok: false, reason: 'INSUFFICIENT_OBSERVED_BID_SIZE' };
  }
  if (Math.abs(spotAtExit - quote.spot) > Math.max(1e-8, quote.spot * 1e-8)) {
    return { ok: false, reason: 'PAPER_CLOSE_SPOT_DOES_NOT_MATCH_INDEX' };
  }

  const entrySourceTimestamp = Date.parse(trade.sourceTimestampsAtEntry?.bookTicker ?? '');
  const entryReceivedTimestamp = Date.parse(trade.sourceReceivedAtAtEntry?.bidAsk ?? '');
  const entryCreatedTimestamp = Date.parse(trade.createdAt);
  if (!Number.isFinite(entrySourceTimestamp) || !Number.isFinite(entryReceivedTimestamp)
    || !Number.isFinite(entryCreatedTimestamp) || entrySourceTimestamp > entryReceivedTimestamp
    || entryReceivedTimestamp > entryCreatedTimestamp || entryCreatedTimestamp >= closedAtMs
    || entryReceivedTimestamp - entrySourceTimestamp > MAX_PAPER_CLOSE_SOURCE_AGE_MS) {
    return { ok: false, reason: 'PAPER_ENTRY_RECEIVE_TIMESTAMP_MISSING_OR_INVALID' };
  }
  const economics = trade.contractEconomics!;
  const exitEconomics = quote.contractEconomics!;
  const settlement = economics.exercise.cashSettlement;
  if (!validateContractEconomics(economics).adapterReady
    || !validateContractEconomics(exitEconomics).adapterReady
    || economics.provenance.status !== 'PROVIDER_VERIFIED'
    || economics.provenance.provider !== 'BINANCE'
    || economics.provenance.sourceRef !== 'https://eapi.binance.com/eapi/v1/exchangeInfo'
    || exitEconomics.provenance.status !== 'PROVIDER_VERIFIED'
    || exitEconomics.provenance.provider !== 'BINANCE'
    || exitEconomics.provenance.sourceRef !== economics.provenance.sourceRef
    || economics.premium.priceUnit !== 'PER_CONTRACT'
    || economics.exercise.style !== 'EUROPEAN'
    || economics.exercise.settlement !== 'CASH'
    || !settlement || settlement.reference !== 'INDEX'
    || settlement.currency !== quote.settlementAsset
    || economics.premium.quoteCurrency !== quote.quoteAsset
    || economics.exercise.settlementCurrency !== quote.settlementAsset
    || settlement.multiplier !== quote.unit
    || economics.provenance.rawFields?.unit !== quote.unit) {
    return { ok: false, reason: 'PAPER_CLOSE_CONTRACT_ECONOMICS_NOT_VERIFIED' };
  }
  const entry = calculatePremiumCash({
    economics,
    premiumPrice: trade.entryPremium,
    contracts: trade.quantity,
    fees: trade.fees,
  });
  if (!entry.ok || !Number.isFinite(trade.premiumDebitAtEntry)
    || Math.abs(entry.value.amount - trade.premiumDebitAtEntry!) > Math.max(1e-8, entry.value.amount * 1e-8)
    || Math.abs(entry.value.premiumAmount - (trade.premiumAmountAtEntry ?? Number.NaN)) > Math.max(1e-8, entry.value.premiumAmount * 1e-8)
    || trade.premiumCurrencyAtEntry !== entry.value.currency
    || trade.premiumMultiplierAtEntry !== entry.value.multiplier) {
    return { ok: false, reason: 'PAPER_ENTRY_DEBIT_SNAPSHOT_INVALID' };
  }
  const proceeds = calculatePremiumCash({
    economics,
    premiumPrice: quote.bid,
    contracts: trade.quantity,
    fees: 0,
  });
  if (!proceeds.ok) return { ok: false, reason: proceeds.reason };
  if (exitFees > proceeds.value.premiumAmount) return { ok: false, reason: 'EXIT_FEES_EXCEED_GROSS_PROCEEDS' };
  const netPnl = proceeds.value.premiumAmount - exitFees - entry.value.amount;
  if (!Number.isFinite(netPnl)) return { ok: false, reason: 'INVALID_PAPER_CLOSE_PNL' };

  return {
    ok: true,
    event: {
      schemaVersion: 1,
      eventType: 'CLOSE',
      id,
      tradeId: trade.id,
      closedAt,
      quantity: trade.quantity,
      exitPremium: quote.bid,
      exitFees,
      exitFeesCurrency: proceeds.value.currency,
      exitFeesSource: 'USER_ENTERED',
      grossProceeds: proceeds.value.premiumAmount,
      entryDebit: entry.value.amount,
      netPnl,
      currency: proceeds.value.currency,
      spotAtExit,
      bidAtExit: quote.bid,
      askAtExit: quote.ask,
      bidQuantityAtExit: quote.bidQuantity!,
      bidAskSizeUnitAtExit: 'CONTRACTS',
      bidAskSourceAtExit: 'BOOK_TICKER',
      sourceTimestampsAtExit: {
        bookTicker: quote.sourceTimestamps!.bookTicker!,
        index: quote.sourceTimestamps!.index!,
      },
      sourceReceivedAtAtExit: { bidAsk: quote.sourceReceivedAt!.bidAsk! },
      contractAtExit: {
        symbol: quote.symbol,
        underlying: quote.underlying,
        type: quote.type,
        expiry: quote.expiry,
        strike: quote.strike,
        venue: quote.venue!,
        assetClass: quote.assetClass!,
        underlyingKind: quote.underlyingKind!,
        unit: quote.unit,
        quoteAsset: quote.quoteAsset!,
      },
      contractEconomicsAtExit: exitEconomics,
    },
  };
}


export function isCanonicalPaperCloseEventForTrade(
  event: CanonicalPaperCloseEvent,
  trade: PaperTrade,
): boolean {
  const economics = trade.contractEconomics;
  const entrySourceTimestamp = Date.parse(trade.sourceTimestampsAtEntry?.bookTicker ?? '');
  const entryReceivedTimestamp = Date.parse(trade.sourceReceivedAtAtEntry?.bidAsk ?? '');
  const entryCreatedTimestamp = Date.parse(trade.createdAt);
  if (!economics || !Number.isFinite(entrySourceTimestamp) || !Number.isFinite(entryReceivedTimestamp)
    || !Number.isFinite(entryCreatedTimestamp) || entrySourceTimestamp > entryReceivedTimestamp
    || entryReceivedTimestamp > entryCreatedTimestamp
    || entryReceivedTimestamp - entrySourceTimestamp > MAX_PAPER_CLOSE_SOURCE_AGE_MS
    || event.tradeId !== trade.id || event.quantity !== trade.quantity
    || event.entryDebit !== trade.premiumDebitAtEntry
    || event.currency !== (trade.premiumCurrencyAtEntry ?? trade.quoteAsset)
    || event.contractAtExit.symbol !== trade.symbol
    || event.contractAtExit.underlying !== trade.underlying
    || event.contractAtExit.type !== trade.type
    || event.contractAtExit.expiry !== trade.expiry
    || event.contractAtExit.strike !== trade.strike
    || event.contractAtExit.venue !== trade.contractVenueAtEntry
    || event.contractAtExit.assetClass !== trade.contractAssetClassAtEntry
    || event.contractAtExit.underlyingKind !== trade.contractUnderlyingKindAtEntry
    || event.contractAtExit.unit !== trade.contractUnitAtEntry
    || event.contractAtExit.quoteAsset !== trade.quoteAsset
    || trade.priceSourceAtEntry !== 'ASK'
    || trade.bidAskSourceAtEntry !== 'BOOK_TICKER'
    || trade.askSizeUnitAtEntry !== 'CONTRACTS'
    || !Number.isFinite(trade.askQuantityAtEntry) || trade.askQuantityAtEntry! + 1e-9 < trade.quantity
    || Date.parse(event.closedAt) <= Date.parse(trade.createdAt)
    || Date.parse(event.closedAt) >= Date.parse(trade.expiry)
    || stableJson(comparableContractEconomics(event.contractEconomicsAtExit)) !== stableJson(comparableContractEconomics(economics))) return false;
  const entry = calculatePremiumCash({
    economics,
    premiumPrice: trade.entryPremium,
    contracts: trade.quantity,
    fees: trade.fees,
  });
  return entry.ok && Math.abs(entry.value.amount - event.entryDebit) <= Math.max(1e-8, entry.value.amount * 1e-8);
}
