import { isQuoteFieldEstimated } from './quote-quality.ts';
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

export function getContractScaleIssueMessage(issue: ContractScaleIssue): string {
  return issue === 'UNIT_UNVERIFIED'
    ? 'وحدة العقد غير موثّقة أو افتراضية؛ أوقفنا حسابات الكمية والربح والخسارة لكل عقد.'
    : issue === 'MULTIPLIER_MISMATCH'
      ? 'يختلف contractMultiplier عن unit؛ مقياس التسعير والتسليم غير ممثل بعد، لذلك أوقفنا حسابات العقد والمحاكاة التاريخية.'
      : issue === 'PREMIUM_SCALE_UNVERIFIED'
        ? 'unit تمثل كمية الأصل الأساسي لكل عقد، وليست مضاعف القسط. لم نفصل بعد سعر القسط لكل عقد عن كمية التسليم؛ نعرض السوق المرصود ونوقف P&L وGreeks المركز وEV والمحاكاة لهذا العقد.'
        : 'لم يتم التحقق من نموذج مقياس هذا السوق والعقد؛ نعرض الأسعار المرصودة فقط ونوقف P&L لكل عقد والمحاكاة التاريخية إلى أن تتوفر بيانات المضاعف والتسليم المناسبة.';
}
