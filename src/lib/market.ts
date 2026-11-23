import { getMidPrice } from './options.ts';
import type { AssetSnapshot, OptionQuote, Underlying } from './types';

function contractKey(quote: OptionQuote): string {
  return `${quote.underlying}|${quote.expiry}|${quote.strike}|${quote.type}`;
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

  const spots = rows.map((quote) => quote.spot).sort((a, b) => a - b);
  const near30Iv = rows
    .filter((quote) => quote.daysToExpiry >= 20 && quote.daysToExpiry <= 40)
    .map((quote) => quote.iv)
    .sort((a, b) => a - b);
  const oiRows = rows.filter((quote) => quote.openInterestUsd != null || quote.openInterest !== null);
  const volumeRows = rows.filter((quote) => quote.volumeQuote != null || quote.volume !== null);
  const openInterestUsd = oiRows.length
    ? oiRows.reduce((sum, quote) => sum + (quote.openInterestUsd ?? (quote.openInterest ?? 0) * quote.spot * quote.unit), 0)
    : null;
  const volume24hUsd = volumeRows.length
    ? volumeRows.reduce((sum, quote) => sum + (quote.volumeQuote ?? (quote.volume ?? 0) * getMidPrice(quote) * quote.unit), 0)
    : null;

  return {
    underlying,
    spot: spots[Math.floor(spots.length / 2)],
    dayChangePct: 0,
    iv30: near30Iv.length ? near30Iv[Math.floor(near30Iv.length / 2)] : null,
    rv30: null,
    openInterestUsd,
    openInterestUsdEstimated: oiRows.some((quote) => quote.openInterestUsd == null),
    volume24hUsd,
    volume24hUsdEstimated: volumeRows.some((quote) => quote.volumeQuote == null),
    fundingRate: 0,
  };
}
