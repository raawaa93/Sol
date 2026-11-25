import { calculatePremiumCash } from './contract-economics-calculations.ts';
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
  if (quote.bid > 0 && quote.ask >= quote.bid) return 'MID';
  if (quote.markPrice > 0) return 'MARK';
  if (quote.bid > 0) return 'BID';
  if (quote.ask > 0) return 'ASK';
  return undefined;
}

function hasObservedPriceTimestamp(quote: OptionQuote, source: NonNullable<OptionQuote['priceSource']>): boolean {
  const timestamps = quote.sourceTimestamps;
  if (!timestamps) return false;
  if (source === 'MARK') return Boolean(timestamps.markPrice);
  if (source === 'MID' || source === 'BID' || source === 'ASK') return Boolean(timestamps.bookTicker || timestamps.optionTicker);
  return false;
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
  if (economics.provenance.status !== 'PROVIDER_VERIFIED'
    || economics.provenance.provider !== 'BINANCE'
    || economics.provenance.sourceRef !== 'https://eapi.binance.com/eapi/v1/exchangeInfo') return false;
  if (economics.premium.priceUnit !== 'PER_CONTRACT'
    || economics.exercise.style !== 'EUROPEAN'
    || economics.exercise.settlement !== 'CASH'
    || economics.exercise.cashSettlement?.reference !== 'INDEX'
    || economics.exercise.cashSettlement.currency !== quote.settlementAsset
    || economics.exercise.settlementCurrency !== quote.settlementAsset) return false;
  const entryPriceSource = getPaperEntryPriceSource(quote);
  if (!entryPriceSource || quote.estimatedFields?.includes('markPrice') && entryPriceSource === 'MARK') return false;
  if (!hasObservedPriceTimestamp(quote, entryPriceSource) || !quote.sourceTimestamps?.index) return false;
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
  const economics = quote.contractEconomics!;
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
