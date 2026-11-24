import { getMidPrice, getUnderlyingReferencePrice } from './options.ts';
import { getQuoteCurrency } from './format.ts';
import { isQuoteFieldEstimated } from './quote-quality.ts';
import type { AssetSnapshot, OptionQuote, Underlying } from './types';

function contractKey(quote: OptionQuote): string {
  return `${quote.venue ?? 'UNKNOWN'}|${quote.symbol}|${quote.underlying}|${quote.expiry}|${quote.strike}|${quote.type}|${quote.underlyingKind ?? 'UNKNOWN'}|${quote.contractMultiplier ?? quote.unit}`;
}

function timestampOf(quote: OptionQuote): number {
  if (!quote.sourceTimestamp) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(quote.sourceTimestamp);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

/** Keep one (latest timestamped) observation per contract for snapshot aggregations. */
export function getLatestQuotePerContract(quotes: OptionQuote[]): OptionQuote[] {
  const latestByContract = new Map<string, OptionQuote>();
  for (const quote of quotes) {
    const key = contractKey(quote);
    const current = latestByContract.get(key);
    if (!current || timestampOf(quote) >= timestampOf(current)) latestByContract.set(key, quote);
  }
  return [...latestByContract.values()];
}

/** Aggregate a single-source option snapshot without double-counting repeated rows. */
export function getMarketSnapshotFromQuotes(quotes: OptionQuote[], underlying: Underlying): AssetSnapshot | null {
  const rows = getLatestQuotePerContract(quotes.filter((quote) => quote.underlying === underlying));
  if (!rows.length) return null;

  const referencePrices = rows.map(getUnderlyingReferencePrice).sort((a, b) => a - b);
  const near30Iv = rows
    .filter((quote) => quote.daysToExpiry >= 20 && quote.daysToExpiry <= 40
      && !isQuoteFieldEstimated(quote, 'daysToExpiry')
      && !isQuoteFieldEstimated(quote, 'iv')
      && quote.iv > 0 && Number.isFinite(quote.iv))
    .map((quote) => quote.iv)
    .sort((a, b) => a - b);
  const oiRows = rows.filter((quote) => quote.openInterestUsd != null || quote.openInterest !== null);
  const volumeRows = rows.filter((quote) => quote.volumeQuote != null || quote.volume !== null);
  const oiAmounts = oiRows.map((quote) => {
    if (quote.openInterestUsd != null) return { value: quote.openInterestUsd, currency: 'USD', estimated: false };
    const currency = getQuoteCurrency(quote);
    const referencePrice = getUnderlyingReferencePrice(quote);
    if (quote.openInterest === null || !currency || !Number.isFinite(referencePrice) || referencePrice <= 0) return null;
    return { value: quote.openInterest * referencePrice * quote.unit, currency, estimated: true };
  });
  const oiCurrencies = new Set(oiAmounts.filter((amount) => amount !== null).map((amount) => amount!.currency));
  const openInterestCurrency = oiAmounts.length > 0 && oiAmounts.every((amount) => amount !== null) && oiCurrencies.size === 1
    ? [...oiCurrencies][0]
    : undefined;
  const openInterestUsd = openInterestCurrency
    ? oiAmounts.reduce((sum, amount) => sum + (amount?.value ?? 0), 0)
    : null;
  const volumeAmounts = volumeRows.map((quote) => {
    const currency = getQuoteCurrency(quote);
    if (!currency) return null;
    if (quote.volumeQuote != null) return { value: quote.volumeQuote, currency, estimated: false };
    const midPrice = getMidPrice(quote);
    if (quote.volume === null || !Number.isFinite(midPrice) || midPrice <= 0) return null;
    return { value: quote.volume * midPrice * quote.unit, currency, estimated: true };
  });
  const volumeCurrencies = new Set(volumeAmounts.filter((amount) => amount !== null).map((amount) => amount!.currency));
  const volume24hCurrency = volumeAmounts.length > 0 && volumeAmounts.every((amount) => amount !== null) && volumeCurrencies.size === 1
    ? [...volumeCurrencies][0]
    : undefined;
  const volume24hUsd = volume24hCurrency
    ? volumeAmounts.reduce((sum, amount) => sum + (amount?.value ?? 0), 0)
    : null;

  return {
    underlying,
    spot: referencePrices[Math.floor(referencePrices.length / 2)],
    dayChangePct: 0,
    iv30: near30Iv.length ? near30Iv[Math.floor(near30Iv.length / 2)] : null,
    rv30: null,
    openInterestUsd,
    openInterestCurrency,
    openInterestUsdEstimated: openInterestCurrency ? oiAmounts.some((amount) => amount?.estimated) : false,
    volume24hUsd,
    volume24hCurrency,
    volume24hUsdEstimated: volume24hCurrency ? volumeAmounts.some((amount) => amount?.estimated) : false,
    fundingRate: 0,
  };
}
