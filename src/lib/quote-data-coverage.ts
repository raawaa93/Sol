import type { OptionQuote } from './types.ts';

export interface QuoteDataCoverage {
  contracts: number;
  twoSidedQuotes: number;
  oneSidedQuotes: number;
  missingBothSides: number;
  crossedQuotes: number;
  observedIv: number;
  estimatedIv: number;
  unavailableIv: number;
  openInterestAvailable: number;
  volumeAvailable: number;
  providerVerifiedEconomics: number;
}

export function getQuoteDataCoverage(quotes: OptionQuote[]): QuoteDataCoverage {
  return quotes.reduce<QuoteDataCoverage>((coverage, quote) => {
    coverage.contracts += 1;

    const hasBid = Number.isFinite(quote.bid) && quote.bid > 0;
    const hasAsk = Number.isFinite(quote.ask) && quote.ask > 0;
    if (hasBid && hasAsk && quote.ask >= quote.bid) coverage.twoSidedQuotes += 1;
    else if (hasBid !== hasAsk) coverage.oneSidedQuotes += 1;
    else if (!hasBid && !hasAsk) coverage.missingBothSides += 1;
    else coverage.crossedQuotes += 1;

    const ivStatus = quote.ivStatus
      ?? (quote.iv > 0 && Number.isFinite(quote.iv)
        ? quote.estimatedFields?.includes('iv') ? 'ESTIMATED' : 'OBSERVED'
        : 'UNAVAILABLE');
    if (ivStatus === 'OBSERVED') coverage.observedIv += 1;
    else if (ivStatus === 'ESTIMATED') coverage.estimatedIv += 1;
    else coverage.unavailableIv += 1;

    if (quote.openInterest !== null) coverage.openInterestAvailable += 1;
    if (quote.volume !== null) coverage.volumeAvailable += 1;
    if (quote.contractEconomics?.provenance.status === 'PROVIDER_VERIFIED') {
      coverage.providerVerifiedEconomics += 1;
    }
    return coverage;
  }, {
    contracts: 0,
    twoSidedQuotes: 0,
    oneSidedQuotes: 0,
    missingBothSides: 0,
    crossedQuotes: 0,
    observedIv: 0,
    estimatedIv: 0,
    unavailableIv: 0,
    openInterestAvailable: 0,
    volumeAvailable: 0,
    providerVerifiedEconomics: 0,
  });
}
