import type { OptionQuote } from './types.ts';

/**
 * Checks whether our normalizer explicitly marked a field as derived/defaulted.
 * An unmarked value is not proof of upstream freshness or exchange validation;
 * Demo quotes are synthetic regardless of this marker.
 */
export function isQuoteFieldEstimated(
  quote: Pick<OptionQuote, 'estimatedFields'>,
  field: string,
): boolean {
  return quote.estimatedFields?.includes(field) ?? false;
}
