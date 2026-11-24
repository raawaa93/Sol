import { isQuoteFieldEstimated } from './quote-quality.ts';
import type { OptionQuote } from './types.ts';

export type ContractScaleIssue = 'UNIT_UNVERIFIED' | 'MULTIPLIER_MISMATCH';

/**
 * The current scalar P&L model is valid only when the underlying contract unit
 * is explicit and any separately supplied contract multiplier agrees with it.
 * Futures and adjusted deliverables with distinct scales need a richer model.
 */
export function getContractScaleIssue(
  quote: Pick<OptionQuote, 'unit' | 'contractMultiplier' | 'estimatedFields'>,
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

  return undefined;
}

export function getContractScaleIssueMessage(issue: ContractScaleIssue): string {
  return issue === 'UNIT_UNVERIFIED'
    ? 'وحدة العقد غير موثّقة أو افتراضية؛ أوقفنا حسابات الكمية والربح والخسارة لكل عقد.'
    : 'يختلف contractMultiplier عن unit؛ مقياس التسعير والتسليم غير ممثل بعد، لذلك أوقفنا حسابات العقد والمحاكاة التاريخية.';
}
