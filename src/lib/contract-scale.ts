import { isQuoteFieldEstimated } from './quote-quality.ts';
import { validateContractEconomics } from './contract-economics.ts';
import type { OptionQuote } from './types.ts';

export type ContractScaleIssue = 'UNIT_UNVERIFIED' | 'MULTIPLIER_MISMATCH' | 'PREMIUM_SCALE_UNVERIFIED' | 'UNSUPPORTED_CONTRACT_SCALE';
export type ContractScaleSourceMode = 'DEMO' | 'CSV' | 'BINANCE';

type ScaleMetadata = Pick<OptionQuote,
  'unit' | 'contractMultiplier' | 'estimatedFields' | 'venue' | 'assetClass'
  | 'underlyingKind' | 'exerciseStyle' | 'settlementStyle' | 'quoteAsset' | 'settlementAsset'
>;

function hasSupportedCryptoScaleProfile(quote: ScaleMetadata): boolean {
  return quote.assetClass === 'CRYPTO'
    && quote.underlyingKind === 'SPOT'
    && quote.exerciseStyle === 'EUROPEAN'
    && quote.settlementStyle === 'CASH'
    && Boolean(quote.quoteAsset)
    && quote.quoteAsset === quote.settlementAsset;
}

/**
 * Only the active app data mode may establish provenance. A CSV row can contain
 * venue="DEMO" or venue="BINANCE"; those strings are user input, not proof that
 * the row came from those sources.
 *
 * The current scalar P&L model is restricted to synthetic Demo fixtures and
 * crypto contracts where unit === 1, so premium-per-contract and per-underlying
 * scales are numerically identical. Binance defines unit as underlying quantity
 * per contract; it is not a documented premium multiplier. For unit > 1, the
 * canonical premium/deliverable adapter is required. CSV also needs explicit
 * matching fields, but a matching scalar cannot resolve unit > 1.
 */
export function getContractScaleIssue(
  quote: ScaleMetadata,
  sourceMode: ContractScaleSourceMode = 'CSV',
): ContractScaleIssue | undefined {
  if (!Number.isFinite(quote.unit) || quote.unit <= 0 || isQuoteFieldEstimated(quote, 'unit')) {
    return 'UNIT_UNVERIFIED';
  }

  if (quote.contractMultiplier !== undefined) {
    if (!Number.isFinite(quote.contractMultiplier) || quote.contractMultiplier <= 0) {
      return 'MULTIPLIER_MISMATCH';
    }
    const tolerance = Math.max(1e-9, quote.unit * 1e-9);
    if (Math.abs(quote.contractMultiplier - quote.unit) > tolerance) {
      return 'MULTIPLIER_MISMATCH';
    }
  }

  if (sourceMode === 'DEMO') {
    return quote.venue === 'DEMO' ? undefined : 'UNSUPPORTED_CONTRACT_SCALE';
  }

  if (!hasSupportedCryptoScaleProfile(quote)) {
    return 'UNSUPPORTED_CONTRACT_SCALE';
  }

  // Binance defines unit as underlying quantity per contract. The legacy
  // scalar P&L model multiplies premium and payoff by unit, so crypto spot
  // contracts with unit > 1 remain blocked until those scales are routed
  // independently. The same guard applies to CSV crypto spot rows.
  if (quote.unit !== 1) {
    return 'PREMIUM_SCALE_UNVERIFIED';
  }

  if (sourceMode === 'BINANCE') {
    return quote.venue === 'BINANCE' ? undefined : 'UNSUPPORTED_CONTRACT_SCALE';
  }

  // CSV metadata is user-supplied. Require a named non-Demo venue and an
  // explicit matching multiplier; never trust venue labels as source identity.
  const hasNamedVenue = Boolean(quote.venue && quote.venue !== 'DEMO');
  const hasExplicitMultiplier = quote.contractMultiplier !== undefined;
  return hasNamedVenue && hasExplicitMultiplier ? undefined : 'UNSUPPORTED_CONTRACT_SCALE';
}

/**
 * Legacy scalar analytics are never valid for a quote that carries canonical
 * terms. Such quotes must be consumed by an explicitly canonical/model-aware
 * capability, even when the old unit=1 parity guard would otherwise pass.
 */
export function hasLegacyScalarAnalyticsCapability(
  quote: ScaleMetadata & Pick<OptionQuote, 'contractEconomics'>,
  sourceMode: ContractScaleSourceMode = 'CSV',
): boolean {
  return quote.contractEconomics === undefined
    && getContractScaleIssue(quote, sourceMode) === undefined;
}

/**
 * A narrowly scoped adapter for Binance European crypto options whose model
 * Greeks are calculated per underlying unit and whose verified cash payout
 * multiplier equals that underlying quantity per contract. This does not
 * authorize legacy premium/P&L/EV/PAPER/replay calculations.
 */
export function hasCanonicalBinanceModelGreekCapability(
  quote: OptionQuote,
  sourceMode: ContractScaleSourceMode = 'CSV',
): boolean {
  const economics = quote.contractEconomics;
  const cash = economics?.exercise.cashSettlement;
  if (!economics || !cash) return false;
  const validation = validateContractEconomics(economics);
  const validTimestamp = (value: string | undefined) => Boolean(value && Number.isFinite(Date.parse(value)));
  const estimated = quote.estimatedFields ?? [];

  return sourceMode === 'BINANCE'
    && quote.venue === 'BINANCE'
    && quote.assetClass === 'CRYPTO'
    && quote.underlyingKind === 'SPOT'
    && quote.exerciseStyle === 'EUROPEAN'
    && quote.settlementStyle === 'CASH'
    && validation.valid
    && validation.adapterReady
    && economics.provenance.status === 'PROVIDER_VERIFIED'
    && economics.provenance.provider === 'BINANCE'
    && economics.provenance.sourceRef === 'https://eapi.binance.com/eapi/v1/exchangeInfo'
    && economics.provenance.rawFields?.unit === quote.unit
    && economics.premium.priceUnit === 'PER_CONTRACT'
    && economics.premium.multiplier === 1
    && economics.premium.quoteCurrency === quote.quoteAsset
    && economics.premium.quoteCurrency === cash.currency
    && economics.exercise.style === 'EUROPEAN'
    && economics.exercise.settlement === 'CASH'
    && economics.exercise.settlementCurrency === quote.settlementAsset
    && cash.formula === 'INTRINSIC_VALUE'
    && cash.reference === 'INDEX'
    && cash.currency === quote.settlementAsset
    && Number.isFinite(quote.unit)
    && quote.unit > 0
    && cash.multiplier === quote.unit
    && quote.pricingModel === 'BLACK_SCHOLES_CARRY'
    && (quote.pricingStatus === 'ASSUMED' || quote.pricingStatus === 'SUPPORTED')
    && quote.ivStatus === 'OBSERVED'
    && !estimated.some((field) => ['iv', 'spot', 'daysToExpiry', 'riskFreeRate', 'delta', 'gamma', 'theta', 'vega', 'rho'].includes(field))
    && Number.isFinite(quote.spot) && quote.spot > 0
    && Number.isFinite(quote.strike) && quote.strike > 0
    && Number.isFinite(quote.daysToExpiry) && quote.daysToExpiry >= 0
    && Number.isFinite(quote.iv) && quote.iv > 0 && quote.iv <= 5
    && Number.isFinite(quote.riskFreeRate)
    && Number.isFinite(quote.carryYield)
    && [quote.delta, quote.gamma, quote.theta, quote.vega, quote.rho].every(Number.isFinite)
    && validTimestamp(quote.sourceTimestamps?.index)
    && validTimestamp(quote.sourceTimestamps?.optionTicker)
    && validTimestamp(quote.sourceTimestamps?.markIv)
    && quote.sourceTimestamps?.markIv === quote.sourceTimestamps?.optionTicker;
}

export function getContractScaleIssueMessage(issue: ContractScaleIssue): string {
  return issue === 'UNIT_UNVERIFIED'
    ? 'وحدة العقد غير موثّقة أو افتراضية؛ أوقفنا حسابات الكمية والربح والخسارة لكل عقد.'
    : issue === 'MULTIPLIER_MISMATCH'
      ? 'يختلف contractMultiplier عن unit؛ مقياس التسعير والتسليم غير ممثل بعد، لذلك أوقفنا حسابات العقد والمحاكاة التاريخية.'
      : issue === 'PREMIUM_SCALE_UNVERIFIED'
        ? 'unit تمثل كمية الأصل الأساسي لكل عقد، وليست مضاعف القسط. لم نفصل بعد سعر القسط لكل عقد عن كمية التسليم؛ نعرض السوق المرصود ونوقف P&L وGreeks المركز وEV والمحاكاة لهذا العقد.'
        : 'لم يتم التحقق من نموذج مقياس هذا السوق والعقد؛ نعرض الأسعار المرصودة فقط ونوقف P&L لكل عقد والمحاكاة التاريخية إلى أن تتوفر بيانات المضاعف والتسليم المناسبة.';
}
