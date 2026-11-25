import { calculateCashSettlementPayoff, type CashSettlementPayoffValue, type EconomicsCalculationResult } from './contract-economics-calculations.ts';
import { validateContractEconomics } from './contract-economics.ts';
import { normalCdf } from './options.ts';
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


export interface QuoteCashRiskNeutralMetrics {
  probabilityOfProfit: number;
  probabilityInTheMoney: number;
  /** Undiscounted risk-neutral expected expiry P&L for one contract, net of entry fees. */
  expectedExpiryPnlPerContract: number;
  /** Discounted model value for one contract under the stated risk-neutral assumptions. */
  modelPricePerContract: number;
  modelValueGapPerContract: number;
  breakevenPrice: number;
  riskFreeRate: number;
  carryYield: number;
  currency: string;
}

/**
 * Risk-neutral expiry metrics for provider-verified Binance-style European
 * cash-settled contracts. The model is conditional on the observed IV/rate
 * and explicitly supplied carry assumption; it is not a real-world forecast.
 */
export function calculateQuoteCashRiskNeutralMetrics(
  quote: OptionQuote,
  entryPremiumPerContract: number,
  feesPerContract = 0,
  nowMs = Date.now(),
): QuoteCashRiskNeutralMetrics | null {
  const economics = supportedCashEconomics(quote);
  const cashSettlement = economics?.exercise.cashSettlement;
  const markIvReceivedAt = Date.parse(quote.sourceReceivedAt?.markIv ?? '');
  const riskFreeReceivedAt = quote.riskFreeRateSource === 'MARK_PRICE'
    ? Date.parse(quote.sourceTimestamps?.riskFreeRate ?? '')
    : Date.parse(quote.sourceReceivedAt?.riskFreeRate ?? '');
  const indexTimestamp = Date.parse(quote.sourceTimestamps?.index ?? '');
  const markIvFresh = Number.isFinite(markIvReceivedAt) && nowMs >= markIvReceivedAt && nowMs - markIvReceivedAt <= 60_000;
  const riskFreeFresh = Number.isFinite(riskFreeReceivedAt) && nowMs >= riskFreeReceivedAt && nowMs - riskFreeReceivedAt <= 60_000;
  const indexFresh = Number.isFinite(indexTimestamp) && nowMs >= indexTimestamp && nowMs - indexTimestamp <= 15_000;
  if (!economics || !cashSettlement || economics.provenance.status !== 'PROVIDER_VERIFIED'
    || economics.provenance.provider !== 'BINANCE'
    || economics.exercise.style !== 'EUROPEAN'
    || economics.exercise.settlement !== 'CASH'
    || quote.exerciseStyle !== 'EUROPEAN'
    || quote.settlementStyle !== 'CASH'
    || cashSettlement.formula !== 'INTRINSIC_VALUE'
    || cashSettlement.reference !== 'INDEX'
    || economics.premium.priceUnit !== 'PER_CONTRACT'
    || economics.premium.quoteCurrency !== cashSettlement.currency
    || quote.venue !== 'BINANCE' || quote.assetClass !== 'CRYPTO'
    || quote.underlyingKind !== 'SPOT'
    || quote.quoteAsset !== economics.premium.quoteCurrency
    || quote.settlementAsset !== cashSettlement.currency
    || quote.unit !== cashSettlement.multiplier
    || !Number.isFinite(quote.bid) || quote.bid <= 0
    || !Number.isFinite(quote.ask) || quote.ask <= 0 || quote.ask < quote.bid
    || quote.estimatedFields?.some((field) => ['bid', 'ask'].includes(field))
    || (quote.bidAskSource === 'BOOK_TICKER'
      ? !quote.sourceTimestamps?.bookTicker || !Number.isFinite(Date.parse(quote.sourceTimestamps.bookTicker))
      : quote.bidAskSource === 'OPTION_TICKER'
        ? !quote.sourceTimestamps?.optionTicker || !Number.isFinite(Date.parse(quote.sourceTimestamps.optionTicker))
        : quote.bidAskSource === 'MARK_PRICE'
          ? !quote.sourceTimestamps?.markPrice || !Number.isFinite(Date.parse(quote.sourceTimestamps.markPrice))
          : true)
    || !quote.sourceTimestamps?.index
    || !Number.isFinite(Date.parse(quote.sourceTimestamps.index))
    || quote.pricingModel !== 'BLACK_SCHOLES_CARRY'
    || !['SUPPORTED', 'ASSUMED'].includes(quote.pricingStatus ?? '')
    || quote.ivStatus !== 'OBSERVED'
    || quote.markIvSource !== 'REST_MARK'
    || (quote.riskFreeRateSource !== 'REST_MARK' && quote.riskFreeRateSource !== 'MARK_PRICE')
    || !markIvFresh || !riskFreeFresh || !indexFresh
    || quote.estimatedFields?.some((field) => ['iv', 'spot', 'riskFreeRate', 'daysToExpiry'].includes(field))
    || !Number.isFinite(quote.riskFreeRate)
    || !Number.isFinite(quote.carryYield)
    || !Number.isFinite(quote.spot) || quote.spot <= 0
    || !Number.isFinite(quote.strike) || quote.strike <= 0
    || !Number.isFinite(quote.daysToExpiry) || quote.daysToExpiry < 0
    || !Number.isFinite(quote.iv) || quote.iv <= 0 || quote.iv > 5
    || !Number.isFinite(entryPremiumPerContract) || entryPremiumPerContract < 0
    || !Number.isFinite(feesPerContract) || feesPerContract < 0
    || (quote.type !== 'CALL' && quote.type !== 'PUT')) return null;

  const cashMultiplier = cashSettlement.multiplier;
  const premiumMultiplier = economics.premium.multiplier;
  if (!Number.isFinite(cashMultiplier) || cashMultiplier <= 0
    || !Number.isFinite(premiumMultiplier) || premiumMultiplier <= 0) return null;

  const rate = quote.riskFreeRate!;
  const carry = quote.carryYield!;
  const time = quote.daysToExpiry / 365;
  const premiumCash = entryPremiumPerContract * premiumMultiplier;
  const totalDebit = premiumCash + feesPerContract;
  const breakevenPrice = quote.type === 'CALL'
    ? quote.strike + totalDebit / cashMultiplier
    : quote.strike - totalDebit / cashMultiplier;
  if (!Number.isFinite(breakevenPrice)) return null;

  if (time === 0) {
    const intrinsicPerReferenceUnit = quote.type === 'CALL'
      ? Math.max(quote.spot - quote.strike, 0)
      : Math.max(quote.strike - quote.spot, 0);
    const expectedIntrinsic = intrinsicPerReferenceUnit * cashMultiplier;
    const itm = quote.type === 'CALL' ? quote.spot > quote.strike : quote.spot < quote.strike;
    const profitable = expectedIntrinsic > totalDebit;
    const modelPricePerContract = expectedIntrinsic;
    return {
      probabilityOfProfit: profitable ? 1 : 0,
      probabilityInTheMoney: itm ? 1 : 0,
      expectedExpiryPnlPerContract: expectedIntrinsic - totalDebit,
      modelPricePerContract,
      modelValueGapPerContract: modelPricePerContract - premiumCash,
      breakevenPrice,
      riskFreeRate: rate,
      carryYield: carry,
      currency: cashSettlement.currency,
    };
  }

  const sigmaRootTime = quote.iv * Math.sqrt(time);
  if (!Number.isFinite(sigmaRootTime) || sigmaRootTime <= 0) return null;
  const drift = rate - carry - 0.5 * quote.iv * quote.iv;
  const d2Strike = (Math.log(quote.spot / quote.strike) + drift * time) / sigmaRootTime;
  const d1Strike = d2Strike + sigmaRootTime;
  const probabilityInTheMoney = quote.type === 'CALL' ? normalCdf(d2Strike) : normalCdf(-d2Strike);

  let probabilityOfProfit = 0;
  if (breakevenPrice > 0) {
    const d2BreakEven = (Math.log(quote.spot / breakevenPrice) + drift * time) / sigmaRootTime;
    probabilityOfProfit = quote.type === 'CALL' ? normalCdf(d2BreakEven) : normalCdf(-d2BreakEven);
  }

  const expectedUnderlying = quote.spot * Math.exp((rate - carry) * time);
  const expectedIntrinsicPerUnit = Math.max(0, quote.type === 'CALL'
    ? expectedUnderlying * normalCdf(d1Strike) - quote.strike * normalCdf(d2Strike)
    : quote.strike * normalCdf(-d2Strike) - expectedUnderlying * normalCdf(-d1Strike));
  const expectedIntrinsic = expectedIntrinsicPerUnit * cashMultiplier;
  const discount = Math.exp(-rate * time);
  const modelPricePerContract = expectedIntrinsic * discount;
  const expectedExpiryPnlPerContract = expectedIntrinsic - totalDebit;
  const modelValueGapPerContract = modelPricePerContract - premiumCash;

  if (![probabilityOfProfit, probabilityInTheMoney, expectedExpiryPnlPerContract, modelPricePerContract].every(Number.isFinite)) return null;
  return {
    probabilityOfProfit: Math.min(1, Math.max(0, probabilityOfProfit)),
    probabilityInTheMoney: Math.min(1, Math.max(0, probabilityInTheMoney)),
    expectedExpiryPnlPerContract,
    modelPricePerContract,
    modelValueGapPerContract,
    breakevenPrice,
    riskFreeRate: rate,
    carryYield: carry,
    currency: cashSettlement.currency,
  };
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
