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
  /** Additional manually specified fees, on top of the exchange fee estimate. */
  fees: number;
  spotAtEntry: number;
}

export type CanonicalPaperTradeResult =
  | { ok: true; trade: PaperTrade; premiumDebit: number; premiumCurrency: string }
  | { ok: false; reason: string };

export interface CanonicalPaperCloseInput {
  trade: PaperTrade;
  quote: OptionQuote;
  closedAt: string;
  /** Additional manually specified exit fees, on top of the exchange fee estimate. */
  additionalFees?: number;
}

export type CanonicalPaperCloseResult =
  | { ok: true; trade: PaperTrade; close: PaperTradeClose }
  | { ok: false; reason: string };

const MAX_PAPER_SOURCE_AGE_MS = 5 * 60_000;
const MAX_BINANCE_OPTION_TRADING_FEE_CAP = 0.1;

function getPaperEntryPriceSource(quote: OptionQuote): OptionQuote['priceSource'] | undefined {
  // A long option entry is simulated at the displayed Ask, never at midpoint/mark.
  if (quote.bid > 0 && quote.ask >= quote.bid && quote.bidAskSource === 'BOOK_TICKER'
    && quote.bidAskSizeUnit === 'CONTRACTS' && Number.isFinite(quote.askQuantity) && quote.askQuantity! > 0) return 'ASK';
  return undefined;
}

function getObservedPriceTimestamp(quote: OptionQuote, source: NonNullable<OptionQuote['priceSource']>): number {
  if (source === 'ASK' || source === 'BID') return Date.parse(quote.sourceTimestamps?.bookTicker ?? '');
  return Number.NaN;
}

function getBidAskReceiveTimestamp(quote: OptionQuote): number {
  return Date.parse(quote.sourceReceivedAt?.bidAsk ?? '');
}

function isProviderVerifiedBinanceEconomics(quote: OptionQuote): boolean {
  const economics = quote.contractEconomics;
  return Boolean(economics
    && validateContractEconomics(economics).adapterReady
    && economics.provenance.status === 'PROVIDER_VERIFIED'
    && economics.provenance.provider === 'BINANCE'
    && economics.provenance.sourceRef === 'https://eapi.binance.com/eapi/v1/exchangeInfo'
    && economics.premium.priceUnit === 'PER_CONTRACT'
    && economics.premium.multiplier === 1
    && economics.exercise.style === 'EUROPEAN'
    && economics.exercise.settlement === 'CASH'
    && economics.exercise.cashSettlement?.reference === 'INDEX');
}

/**
 * Binance Options trading fee estimate:
 * min(taker rate × Spot Index × contract unit, 10% × option traded price) × size.
 * The public symbol fee rate is used; account-specific VIP discounts are not inferred.
 */
export function estimateBinanceOptionsTradingFee(
  quote: OptionQuote,
  optionPrice: number,
  contracts: number,
): number | undefined {
  if (!isProviderVerifiedBinanceEconomics(quote)
    || !Number.isFinite(quote.takerFeeRate) || quote.takerFeeRate! < 0
    || !Number.isFinite(quote.spot) || quote.spot <= 0
    || !Number.isFinite(quote.unit) || quote.unit <= 0
    || !Number.isFinite(optionPrice) || optionPrice <= 0
    || !Number.isFinite(contracts) || contracts <= 0) return undefined;
  const feePerContract = Math.min(
    quote.takerFeeRate! * quote.spot * quote.unit,
    MAX_BINANCE_OPTION_TRADING_FEE_CAP * optionPrice,
  );
  const fee = feePerContract * contracts;
  return Number.isFinite(fee) && fee >= 0 ? fee : undefined;
}

function hasFreshObservedBook(quote: OptionQuote, side: 'ASK' | 'BID', at: number): boolean {
  const eventTime = getObservedPriceTimestamp(quote, side);
  const receiveTime = getBidAskReceiveTimestamp(quote);
  return Number.isFinite(eventTime) && Number.isFinite(receiveTime)
    && eventTime <= at && receiveTime <= at
    && at - eventTime <= MAX_PAPER_SOURCE_AGE_MS
    && at - receiveTime <= MAX_PAPER_SOURCE_AGE_MS;
}

/**
 * Canonical PAPER entries require a verified Binance crypto option and a fresh,
 * sized bookTicker Ask. Midpoint and mark-price snapshots are not entry fills.
 */
export function canCreateCanonicalPaperTrade(
  quote: OptionQuote,
  sourceMode: PaperJournalSourceMode,
): boolean {
  if (sourceMode !== 'BINANCE' || quote.venue !== 'BINANCE' || !isProviderVerifiedBinanceEconomics(quote)) return false;
  if (quote.assetClass !== 'CRYPTO' || quote.underlyingKind !== 'SPOT'
    || quote.exerciseStyle !== 'EUROPEAN' || quote.settlementStyle !== 'CASH'
    || !Number.isFinite(quote.unit) || quote.unit <= 0
    || !Number.isFinite(quote.strike) || quote.strike <= 0
    || !Number.isFinite(Date.parse(quote.expiry))) return false;
  const economics = quote.contractEconomics!;
  const settlement = economics.exercise.cashSettlement;
  if (!settlement || settlement.currency !== quote.settlementAsset
    || economics.exercise.settlementCurrency !== quote.settlementAsset
    || settlement.multiplier !== quote.unit
    || economics.provenance.rawFields?.unit !== quote.unit) return false;
  if (getPaperEntryPriceSource(quote) !== 'ASK'
    || !Number.isFinite(quote.bid) || quote.bid <= 0
    || !Number.isFinite(quote.ask) || quote.ask < quote.bid
    || !Number.isFinite(quote.askQuantity) || quote.askQuantity! <= 0
    || !Number.isFinite(quote.bidQuantity) || quote.bidQuantity! <= 0
    || !quote.quoteAsset || quote.quoteAsset !== economics.premium.quoteCurrency
    || !Number.isFinite(quote.takerFeeRate) || quote.takerFeeRate! < 0) return false;
  return calculatePremiumCash({ economics, premiumPrice: quote.ask, contracts: 1 }).ok;
}

export function createCanonicalPaperTrade(
  input: CanonicalPaperTradeInput,
): CanonicalPaperTradeResult {
  const { quote, sourceMode, id, createdAt, quantity, premiumPrice, fees, spotAtEntry } = input;
  if (!canCreateCanonicalPaperTrade(quote, sourceMode)) {
    return { ok: false, reason: 'CANONICAL_BINANCE_SIZED_ASK_REQUIRED' };
  }
  if (!id.trim() || !Number.isFinite(Date.parse(createdAt))
    || !Number.isFinite(quantity) || quantity <= 0
    || !Number.isFinite(premiumPrice) || premiumPrice <= 0
    || !Number.isFinite(fees) || fees < 0
    || !Number.isFinite(spotAtEntry) || spotAtEntry <= 0) {
    return { ok: false, reason: 'INVALID_PAPER_ENTRY_INPUT' };
  }
  if (quote.bidAskSizeUnit !== 'CONTRACTS' || quote.askQuantity! + 1e-9 < quantity) {
    return { ok: false, reason: 'INSUFFICIENT_ASK_SIZE_FOR_PAPER_ENTRY' };
  }
  const createdAtMs = Date.parse(createdAt);
  const expiryMs = Date.parse(quote.expiry);
  const priceTimestamp = getObservedPriceTimestamp(quote, 'ASK');
  const indexTimestamp = Date.parse(quote.sourceTimestamps?.index ?? '');
  if (!Number.isFinite(expiryMs) || expiryMs <= createdAtMs) {
    return { ok: false, reason: 'OPTION_EXPIRED_AT_PAPER_ENTRY' };
  }
  if (!hasFreshObservedBook(quote, 'ASK', createdAtMs)
    || !Number.isFinite(indexTimestamp) || indexTimestamp > createdAtMs
    || createdAtMs - indexTimestamp > MAX_PAPER_SOURCE_AGE_MS) {
    return { ok: false, reason: 'PAPER_ENTRY_MARKET_SNAPSHOT_STALE_OR_FUTURE' };
  }
  if (Math.abs(premiumPrice - quote.ask) > Math.max(1e-8, quote.ask * 1e-8)) {
    return { ok: false, reason: 'ENTRY_PREMIUM_MUST_MATCH_OBSERVED_ASK' };
  }
  if (Math.abs(spotAtEntry - quote.spot) > Math.max(1e-8, quote.spot * 1e-8)) {
    return { ok: false, reason: 'ENTRY_SPOT_DOES_NOT_MATCH_TIMESTAMPED_INDEX' };
  }
  const economics = quote.contractEconomics!;
  const exchangeFee = estimateBinanceOptionsTradingFee(quote, premiumPrice, quantity);
  if (exchangeFee === undefined) return { ok: false, reason: 'BINANCE_ENTRY_FEE_UNAVAILABLE' };
  const totalFees = exchangeFee + fees;
  const debit = calculatePremiumCash({ economics, premiumPrice, contracts: quantity, fees: totalFees });
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
    fees: totalFees,
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
    priceSourceAtEntry: 'ASK',
    bidAskSourceAtEntry: 'BOOK_TICKER',
    sourceTimestampsAtEntry: quote.sourceTimestamps ? { ...quote.sourceTimestamps } : undefined,
    exchangeFeeAtEntry: exchangeFee,
    additionalFeesAtEntry: fees,
    status: 'PAPER',
  };
  return { ok: true, trade, premiumDebit: debit.value.amount, premiumCurrency: debit.value.currency };
}

function hasSameCanonicalContract(trade: PaperTrade, quote: OptionQuote): boolean {
  const entryEconomics = trade.contractEconomics;
  const currentEconomics = quote.contractEconomics;
  return Boolean(entryEconomics && currentEconomics
    && validateContractEconomics(entryEconomics).adapterReady
    && entryEconomics.provenance.status === 'PROVIDER_VERIFIED'
    && entryEconomics.provenance.provider === 'BINANCE'
    && entryEconomics.provenance.sourceRef === 'https://eapi.binance.com/eapi/v1/exchangeInfo'
    && quote.symbol === trade.symbol
    && quote.venue === trade.contractVenueAtEntry
    && quote.assetClass === trade.contractAssetClassAtEntry
    && quote.underlyingKind === trade.contractUnderlyingKindAtEntry
    && quote.underlying === trade.underlying
    && quote.type === trade.type
    && quote.expiry === trade.expiry
    && quote.strike === trade.strike
    && quote.unit === trade.contractUnitAtEntry
    && currentEconomics.premium.multiplier === trade.premiumMultiplierAtEntry
    && currentEconomics.premium.multiplier === entryEconomics.premium.multiplier
    && currentEconomics.premium.quoteCurrency === trade.premiumCurrencyAtEntry
    && currentEconomics.premium.priceUnit === entryEconomics.premium.priceUnit
    && currentEconomics.exercise.style === entryEconomics.exercise.style
    && currentEconomics.exercise.settlement === entryEconomics.exercise.settlement
    && currentEconomics.exercise.cashSettlement?.reference === entryEconomics.exercise.cashSettlement?.reference
    && currentEconomics.exercise.cashSettlement?.currency === entryEconomics.exercise.cashSettlement?.currency
    && currentEconomics.exercise.cashSettlement?.multiplier === entryEconomics.exercise.cashSettlement?.multiplier
    && isProviderVerifiedBinanceEconomics(quote));
}

export function closeCanonicalPaperTrade(input: CanonicalPaperCloseInput): CanonicalPaperCloseResult {
  const { trade, quote, closedAt, additionalFees = 0 } = input;
  if (trade.status !== 'PAPER' || trade.close) return { ok: false, reason: 'PAPER_TRADE_ALREADY_CLOSED_OR_INVALID' };
  if (!trade.contractEconomics || trade.priceSourceAtEntry !== 'ASK'
    || trade.bidAskSourceAtEntry !== 'BOOK_TICKER'
    || !Number.isFinite(trade.premiumDebitAtEntry) || trade.premiumDebitAtEntry! <= 0) {
    return { ok: false, reason: 'LEGACY_OR_NON_EXECUTABLE_PAPER_ENTRY_CANNOT_BE_CLOSED' };
  }
  if (!hasSameCanonicalContract(trade, quote)) return { ok: false, reason: 'PAPER_CLOSE_CONTRACT_MISMATCH' };
  const closedAtMs = Date.parse(closedAt);
  const entryAtMs = Date.parse(trade.createdAt);
  const expiryMs = Date.parse(trade.expiry);
  if (!Number.isFinite(closedAtMs) || !Number.isFinite(entryAtMs) || closedAtMs < entryAtMs
    || !Number.isFinite(expiryMs) || closedAtMs >= expiryMs) {
    return { ok: false, reason: 'OPTION_EXPIRED_BEFORE_PAPER_CLOSE' };
  }
  if (!Number.isFinite(additionalFees) || additionalFees < 0
    || quote.bidAskSource !== 'BOOK_TICKER' || quote.bidAskSizeUnit !== 'CONTRACTS'
    || !Number.isFinite(quote.bid) || quote.bid <= 0
    || !Number.isFinite(quote.ask) || quote.ask < quote.bid
    || !Number.isFinite(quote.bidQuantity) || quote.bidQuantity! + 1e-9 < trade.quantity) {
    return { ok: false, reason: 'INSUFFICIENT_OR_INVALID_BID_FOR_PAPER_CLOSE' };
  }
  if (!hasFreshObservedBook(quote, 'BID', closedAtMs)) return { ok: false, reason: 'PAPER_CLOSE_MARKET_SNAPSHOT_STALE_OR_FUTURE' };
  const indexTimestamp = Date.parse(quote.sourceTimestamps?.index ?? '');
  if (!Number.isFinite(indexTimestamp) || indexTimestamp > closedAtMs
    || closedAtMs - indexTimestamp > MAX_PAPER_SOURCE_AGE_MS
    || !Number.isFinite(quote.spot) || quote.spot <= 0) {
    return { ok: false, reason: 'PAPER_CLOSE_INDEX_SNAPSHOT_STALE_OR_FUTURE' };
  }
  const economics = trade.contractEconomics;
  const gross = calculatePremiumCash({ economics, premiumPrice: quote.bid, contracts: trade.quantity, fees: 0 });
  if (!gross.ok) return { ok: false, reason: gross.reason };
  const exchangeFee = estimateBinanceOptionsTradingFee(quote, quote.bid, trade.quantity);
  if (exchangeFee === undefined) return { ok: false, reason: 'BINANCE_EXIT_FEE_UNAVAILABLE' };
  const exitFees = exchangeFee + additionalFees;
  const net = gross.value.amount - exitFees;
  if (!Number.isFinite(net) || net < 0) return { ok: false, reason: 'PAPER_EXIT_FEES_EXCEED_PROCEEDS' };
  const realizedPnl = net - trade.premiumDebitAtEntry!;
  if (!Number.isFinite(realizedPnl)) return { ok: false, reason: 'INVALID_PAPER_REALIZED_PNL' };
  const close: PaperTradeClose = {
    closedAt,
    exitPremium: quote.bid,
    exitFees,
    exitExchangeFee: exchangeFee,
    exitAdditionalFees: additionalFees,
    exitGrossProceeds: gross.value.amount,
    exitNetProceeds: net,
    realizedPnl,
    currency: gross.value.currency,
    spotAtExit: quote.spot,
    bidAskSource: 'BOOK_TICKER',
    sourceTimestamps: {
      bookTicker: quote.sourceTimestamps?.bookTicker ?? '',
      index: quote.sourceTimestamps?.index ?? '',
    },
    sourceReceivedAt: quote.sourceReceivedAt?.bidAsk ?? '',
    bidQuantity: quote.bidQuantity!,
    bidAskSizeUnit: 'CONTRACTS',
  };
  return { ok: true, trade: { ...trade, close }, close };
}
