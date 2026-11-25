import { calculateCashSettlementPayoff, type CashSettlementPayoffValue, type EconomicsCalculationResult } from './contract-economics-calculations.ts';
import { validateContractEconomics } from './contract-economics.ts';
import type { OptionQuote } from './types.ts';

export interface QuoteCashRiskInput {
  premiumPrice: number;
  contracts: number;
  fees?: number;
}

export interface QuoteCashExpiryInput extends QuoteCashRiskInput {
  settlementReferencePrice: number;
}

export interface QuoteCashRiskValue {
  amount: number;
  currency: string;
  contracts: number;
}

function supportedCashEconomics(quote: OptionQuote) {
  const economics = quote.contractEconomics;
  if (!economics) return undefined;
  const validation = validateContractEconomics(economics);
  if (!validation.valid || !validation.adapterReady) return undefined;
  if (economics.exercise.settlement !== 'CASH' || !economics.exercise.cashSettlement) return undefined;

  const reference = economics.exercise.cashSettlement.reference;
  const referenceMatchesQuote = reference === 'SPOT'
    ? quote.underlyingKind === 'SPOT' || quote.underlyingKind === 'FX_SPOT'
    : reference === 'INDEX'
      // Binance Crypto Options identifies the contract underlying as CRYPTO/SPOT,
      // while its documented settlement reference is the Spot Price Index.
      // The quote's spot field is populated from the venue's /eapi/v1/index endpoint.
      ? quote.underlyingKind === 'INDEX'
        || (quote.underlyingKind === 'SPOT' && Boolean(quote.sourceTimestamps?.index))
      : reference === 'FORWARD' && quote.underlyingKind === 'FUTURE';
  return referenceMatchesQuote ? economics : undefined;
}

/**
 * Quote-level adapter for deterministic cash-settled intrinsic expiry risk.
 * It never falls back to the legacy unit scalar and requires complete,
 * provider-verified canonical economics with a matching reference kind.
 */
export function calculateQuoteCashExpiryPnl(
  quote: OptionQuote,
  input: QuoteCashExpiryInput,
): EconomicsCalculationResult<CashSettlementPayoffValue> {
  const economics = supportedCashEconomics(quote);
  if (!economics) {
    return { ok: false, reason: 'CONTRACT_NOT_ADAPTER_READY', details: ['SUPPORTED_PROVIDER_VERIFIED_CASH_ECONOMICS_REQUIRED'] };
  }
  return calculateCashSettlementPayoff({
    economics,
    optionType: quote.type,
    strike: quote.strike,
    settlementReferencePrice: input.settlementReferencePrice,
    premiumPrice: input.premiumPrice,
    contracts: input.contracts,
    fees: input.fees,
  });
}

/** Break-even uses the settlement multiplier for intrinsic value and the independent premium multiplier for debit. */
export function calculateQuoteCashBreakeven(
  quote: OptionQuote,
  input: QuoteCashRiskInput,
): EconomicsCalculationResult<QuoteCashRiskValue & { price: number }> {
  const economics = supportedCashEconomics(quote);
  if (!economics) {
    return { ok: false, reason: 'CONTRACT_NOT_ADAPTER_READY', details: ['SUPPORTED_PROVIDER_VERIFIED_CASH_ECONOMICS_REQUIRED'] };
  }
  const { premiumPrice, contracts, fees = 0 } = input;
  if (!Number.isFinite(premiumPrice) || premiumPrice < 0
    || !Number.isFinite(contracts) || contracts <= 0
    || !Number.isFinite(fees) || fees < 0) return { ok: false, reason: 'INVALID_INPUT' };

  const formula = economics.exercise.cashSettlement!;
  const premiumAmount = premiumPrice * economics.premium.multiplier * contracts;
  const totalDebit = premiumAmount + fees;
  const intrinsicPerReferenceUnit = totalDebit / (formula.multiplier * contracts);
  const price = quote.type === 'CALL'
    ? quote.strike + intrinsicPerReferenceUnit
    : quote.strike - intrinsicPerReferenceUnit;
  if (!Number.isFinite(price) || price < 0) return { ok: false, reason: 'INVALID_INPUT' };
  return {
    ok: true,
    value: { amount: totalDebit, currency: formula.currency, contracts, price },
  };
}

/** Maximum loss for a long cash-settled option is premium debit plus fees. */
export function calculateQuoteCashMaxLoss(
  quote: OptionQuote,
  input: QuoteCashRiskInput,
): EconomicsCalculationResult<QuoteCashRiskValue> {
  const economics = supportedCashEconomics(quote);
  if (!economics) {
    return { ok: false, reason: 'CONTRACT_NOT_ADAPTER_READY', details: ['SUPPORTED_PROVIDER_VERIFIED_CASH_ECONOMICS_REQUIRED'] };
  }
  const { premiumPrice, contracts, fees = 0 } = input;
  if (!Number.isFinite(premiumPrice) || premiumPrice < 0
    || !Number.isFinite(contracts) || contracts <= 0
    || !Number.isFinite(fees) || fees < 0) return { ok: false, reason: 'INVALID_INPUT' };
  const amount = premiumPrice * economics.premium.multiplier * contracts + fees;
  if (!Number.isFinite(amount)) return { ok: false, reason: 'INVALID_INPUT' };
  return { ok: true, value: { amount, currency: economics.premium.quoteCurrency, contracts } };
}


export interface QuoteCashExpiryScenarioPoint {
  move: number;
  label: string;
  spot: number;
  pnl: number;
}

/**
 * Builds expiry scenarios from canonical cash-settlement terms.
 * Returns null when the quote is not eligible; callers must not substitute
 * legacy unit-based calculations when canonical terms are present but invalid.
 */
export function buildQuoteCashExpiryScenarioSeries(
  quote: OptionQuote,
  premiumPrice: number,
  contracts: number,
  fees = 0,
): QuoteCashExpiryScenarioPoint[] | null {
  const referencePrice = quote.underlyingKind === 'FUTURE' ? quote.forward : quote.spot;
  if (!Number.isFinite(referencePrice) || referencePrice === undefined || referencePrice <= 0) return null;
  const moves = [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2];
  const points: QuoteCashExpiryScenarioPoint[] = [];
  for (const move of moves) {
    const settlementReferencePrice = referencePrice * (1 + move);
    const result = calculateQuoteCashExpiryPnl(quote, {
      settlementReferencePrice,
      premiumPrice,
      contracts,
      fees,
    });
    if (!result.ok) return null;
    points.push({
      move,
      label: `${move > 0 ? '+' : ''}${Math.round(move * 100)}%`,
      spot: settlementReferencePrice,
      pnl: result.value.netPnl,
    });
  }
  return points;
}
