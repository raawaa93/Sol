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
  spotAtEntry: number;
}

export type CanonicalPaperTradeResult =
  | { ok: true; trade: PaperTrade; premiumDebit: number; premiumCurrency: string }
  | { ok: false; reason: string };

function getPaperEntryPriceSource(quote: OptionQuote): OptionQuote['priceSource'] | undefined {
  // getMidPrice prefers a two-sided mid over markPrice. Never label that mid
  // as MARK when its bid/ask source has no matching event timestamp.
  if (quote.bid > 0 && quote.ask >= quote.bid) {
    return quote.bidAskSource === 'BOOK_TICKER' || quote.bidAskSource === 'OPTION_TICKER' || quote.bidAskSource === 'MARK_PRICE' ? 'MID' : undefined;
  }
  if (quote.priceSource === 'MARK' && quote.markPrice > 0) return 'MARK';
  if (quote.priceSource === 'LAST' && quote.markPrice > 0) return 'LAST';
  if (quote.priceSource === 'BID' && quote.bid > 0) return 'BID';
  if (quote.priceSource === 'ASK' && quote.ask > 0) return 'ASK';
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
  if (!entryPriceSource || quote.estimatedFields?.includes('markPrice') && entryPriceSource === 'MARK') return false;
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
  const economics = quote.contractEconomics!;
  const observedEntryPrice = getPaperEntryPriceSource(quote) === 'MID'
    ? (quote.bid + quote.ask) / 2
    : getPaperEntryPriceSource(quote) === 'MARK' || getPaperEntryPriceSource(quote) === 'LAST'
      ? quote.markPrice
      : getPaperEntryPriceSource(quote) === 'BID' ? quote.bid : quote.ask;
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
