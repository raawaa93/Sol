import { isQuoteFieldEstimated } from './quote-quality.ts';
import type { OptionQuote } from './types.ts';

export type ContractScaleIssue = 'UNIT_UNVERIFIED' | 'MULTIPLIER_MISMATCH' | 'UNSUPPORTED_CONTRACT_SCALE';

/**
 * Explicit unit and multiplier agreement are necessary but not sufficient.
 * The current scalar P&L model is only enabled for synthetic Demo data and
 * the documented Binance European cash-settled crypto-options profile.
 */
export function getContractScaleIssue(
  quote: Pick<OptionQuote, 'unit' | 'contractMultiplier' | 'estimatedFields' | 'venue' | 'assetClass' | 'underlyingKind' | 'exerciseStyle' | 'settlementStyle'>,
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

  const isSyntheticDemo = quote.venue === 'DEMO';
  const isDocumentedBinanceCrypto = quote.venue === 'BINANCE'
    && quote.assetClass === 'CRYPTO'
    && quote.underlyingKind === 'SPOT'
    && quote.exerciseStyle === 'EUROPEAN'
    && quote.settlementStyle === 'CASH';

  if (!isSyntheticDemo && !isDocumentedBinanceCrypto) {
    return 'UNSUPPORTED_CONTRACT_SCALE';
  }

  return undefined;
}

export function getContractScaleIssueMessage(issue: ContractScaleIssue): string {
  if (issue === 'UNIT_UNVERIFIED') {
    return 'وحدة العقد غير موثّقة أو افتراضية؛ أوقفنا حسابات الكمية والربح والخسارة لكل عقد.';
  }
  if (issue === 'MULTIPLIER_MISMATCH') {
    return 'يختلف contractMultiplier عن unit؛ مقياس التسعير والتسليم غير ممثل بعد، لذلك أوقفنا حسابات العقد والمحاكاة التاريخية.';
  }
  return 'لم يتم التحقق من نموذج مقياس هذا السوق والعقد؛ نعرض الأسعار المرصودة فقط ونوقف P&L لكل عقد والمحاكاة التاريخية إلى أن تتوفر بيانات المضاعف والتسليم المناسبة.';
}
