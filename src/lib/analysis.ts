import { getLatestQuotePerContract } from './market.ts';
import { getSpreadPct } from './options.ts';
import { isQuoteFieldEstimated } from './quote-quality.ts';
import type { AssetSnapshot, OptionQuote, OptionSide } from './types';

export interface DeltaSkewComparison {
  expiry: string;
  daysToExpiry: number;
  targetAbsDelta: number;
  callAbsDelta: number;
  putAbsDelta: number;
  callIv: number;
  putIv: number;
  /** Put-wing IV minus call-wing IV, in decimal volatility units. */
  putMinusCallIv: number;
}

export interface AtmTermPoint {
  expiry: string;
  daysToExpiry: number;
  iv: number;
}

export interface TermStructureContext {
  front: AtmTermPoint | null;
  near: AtmTermPoint;
  back: AtmTermPoint | null;
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Null is deliberate: an IV/RV comparison is not inferred without both inputs. */
export function getIvRvSpread(market: AssetSnapshot | null): number | null {
  if (!market || market.iv30 === null || market.rv30 === null
    || !Number.isFinite(market.iv30) || !Number.isFinite(market.rv30)) return null;
  return market.iv30 - market.rv30;
}

/** Compare unestimated put/call IV at approximately matched 25-delta wings on one expiry. */
export function getComparableDeltaSkew(quotes: OptionQuote[], targetAbsDelta = 0.25): DeltaSkewComparison | null {
  if (!Number.isFinite(targetAbsDelta) || targetAbsDelta <= 0 || targetAbsDelta >= 1) return null;
  const rows = getLatestQuotePerContract(quotes).filter((quote) => Number.isFinite(quote.daysToExpiry)
    && quote.daysToExpiry > 0
    && !isQuoteFieldEstimated(quote, 'daysToExpiry')
    && !isQuoteFieldEstimated(quote, 'iv')
    && !isQuoteFieldEstimated(quote, 'delta')
    && quote.iv > 0 && Number.isFinite(quote.iv) && Number.isFinite(quote.delta));
  const rowsByExpiry = new Map<string, OptionQuote[]>();
  rows.forEach((quote) => {
    const expiryRows = rowsByExpiry.get(quote.expiry) ?? [];
    expiryRows.push(quote);
    rowsByExpiry.set(quote.expiry, expiryRows);
  });
  const expiries = [...rowsByExpiry.entries()]
    .flatMap(([expiry, expiryRows]) => {
      const daysToExpiry = median(expiryRows.map((quote) => quote.daysToExpiry));
      return daysToExpiry === null ? [] : [{ expiry, expiryRows, daysToExpiry }];
    })
    .sort((a, b) => Math.abs(a.daysToExpiry - 30) - Math.abs(b.daysToExpiry - 30));
  const comparisons: Array<DeltaSkewComparison & { matchError: number; deltaGap: number }> = [];
  const deltaTolerance = 0.12;

  for (const { expiry, expiryRows, daysToExpiry } of expiries) {
    const calls = expiryRows.filter((quote) => quote.type === 'CALL'
      && Math.abs(Math.abs(quote.delta) - targetAbsDelta) <= deltaTolerance);
    const puts = expiryRows.filter((quote) => quote.type === 'PUT'
      && Math.abs(Math.abs(quote.delta) - targetAbsDelta) <= deltaTolerance);
    const pairs: Array<{ call: OptionQuote; put: OptionQuote; matchError: number; deltaGap: number }> = [];

    calls.forEach((call) => puts.forEach((put) => {
      const callAbsDelta = Math.abs(call.delta);
      const putAbsDelta = Math.abs(put.delta);
      const deltaGap = Math.abs(callAbsDelta - putAbsDelta);
      if (deltaGap <= deltaTolerance) {
        pairs.push({
          call,
          put,
          matchError: Math.abs(callAbsDelta - targetAbsDelta) + Math.abs(putAbsDelta - targetAbsDelta),
          deltaGap,
        });
      }
    }));

    pairs.sort((a, b) => a.matchError - b.matchError || a.deltaGap - b.deltaGap);
    const pair = pairs[0];
    if (!pair) continue;
    comparisons.push({
      expiry,
      daysToExpiry,
      targetAbsDelta,
      callAbsDelta: Math.abs(pair.call.delta),
      putAbsDelta: Math.abs(pair.put.delta),
      callIv: pair.call.iv,
      putIv: pair.put.iv,
      putMinusCallIv: pair.put.iv - pair.call.iv,
      matchError: pair.matchError,
      deltaGap: pair.deltaGap,
    });
  }

  comparisons.sort((a, b) => Math.abs(a.daysToExpiry - 30) - Math.abs(b.daysToExpiry - 30)
    || a.matchError - b.matchError
    || a.deltaGap - b.deltaGap);
  return comparisons[0] ?? null;
}

/** Build an ATM term structure from unestimated IV and expiry values, using median IV per strike. */
export function getAtmTermStructure(quotes: OptionQuote[]): AtmTermPoint[] {
  const rows = getLatestQuotePerContract(quotes).filter((quote) => Number.isFinite(quote.daysToExpiry)
    && quote.daysToExpiry > 0
    && !isQuoteFieldEstimated(quote, 'daysToExpiry')
    && !isQuoteFieldEstimated(quote, 'iv')
    && Number.isFinite(quote.spot) && quote.spot > 0
    && quote.iv > 0 && Number.isFinite(quote.iv));
  const byExpiry = new Map<string, OptionQuote[]>();
  rows.forEach((quote) => {
    const group = byExpiry.get(quote.expiry) ?? [];
    group.push(quote);
    byExpiry.set(quote.expiry, group);
  });

  const points: AtmTermPoint[] = [];
  byExpiry.forEach((expiryRows, expiry) => {
    const byStrike = new Map<number, OptionQuote[]>();
    expiryRows.forEach((quote) => {
      const strikeRows = byStrike.get(quote.strike) ?? [];
      strikeRows.push(quote);
      byStrike.set(quote.strike, strikeRows);
    });
    const strikePoints = [...byStrike.entries()].map(([strike, strikeRows]) => ({
      strike,
      moneyness: Math.abs(strike / (strikeRows[0].underlyingKind === 'FUTURE' ? strikeRows[0].forward ?? strikeRows[0].spot : strikeRows[0].spot) - 1),
      iv: median(strikeRows.map((quote) => quote.iv)) ?? Number.NaN,
    })).filter((point) => Number.isFinite(point.iv));
    const nearAtm = strikePoints.filter((point) => point.moneyness <= 0.05);
    const selected = nearAtm.length
      ? nearAtm
      : [strikePoints.sort((a, b) => a.moneyness - b.moneyness)[0]].filter((point) => point !== undefined);
    const iv = median(selected.map((point) => point.iv));
    const daysToExpiry = median(expiryRows.map((quote) => quote.daysToExpiry));
    if (iv !== null && daysToExpiry !== null) points.push({ expiry, daysToExpiry, iv });
  });

  return points.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

export function getTermStructureContext(quotes: OptionQuote[]): TermStructureContext | null {
  const points = getAtmTermStructure(quotes);
  if (!points.length) return null;
  const nearPool = points.filter((point) => point.daysToExpiry >= 20 && point.daysToExpiry <= 40);
  const near = [...(nearPool.length ? nearPool : points)]
    .sort((a, b) => Math.abs(a.daysToExpiry - 30) - Math.abs(b.daysToExpiry - 30))[0];
  const front = points.filter((point) => point.daysToExpiry < near.daysToExpiry)
    .sort((a, b) => Math.abs(a.daysToExpiry - 14) - Math.abs(b.daysToExpiry - 14))[0] ?? null;
  const back = points.filter((point) => point.daysToExpiry > near.daysToExpiry)
    .sort((a, b) => Math.abs(a.daysToExpiry - 60) - Math.abs(b.daysToExpiry - 60))[0] ?? null;
  return { front, near, back };
}

function compareReviewQuality(a: OptionQuote, b: OptionQuote): number {
  const spreadDifference = getSpreadPct(a) - getSpreadPct(b);
  if (Number.isFinite(spreadDifference) && Math.abs(spreadDifference) > 1e-8) return spreadDifference;
  if (!Number.isFinite(spreadDifference)) return Number.isFinite(getSpreadPct(a)) ? -1 : 1;

  const oiA = a.openInterest ?? -1;
  const oiB = b.openInterest ?? -1;
  if (oiA !== oiB) return oiB - oiA;
  const volumeA = a.volume ?? -1;
  const volumeB = b.volume ?? -1;
  if (volumeA !== volumeB) return volumeB - volumeA;
  const aHasUnestimatedDelta = Number.isFinite(a.delta) && Math.abs(a.delta) <= 1 && !isQuoteFieldEstimated(a, 'delta');
  const bHasUnestimatedDelta = Number.isFinite(b.delta) && Math.abs(b.delta) <= 1 && !isQuoteFieldEstimated(b, 'delta');
  if (aHasUnestimatedDelta !== bHasUnestimatedDelta) return aHasUnestimatedDelta ? -1 : 1;
  if (aHasUnestimatedDelta && bHasUnestimatedDelta) {
    const deltaDistance = Math.abs(Math.abs(a.delta) - 0.5) - Math.abs(Math.abs(b.delta) - 0.5);
    if (Math.abs(deltaDistance) > 1e-8) return deltaDistance;
  }

  const aHasUnestimatedExpiry = Number.isFinite(a.daysToExpiry) && !isQuoteFieldEstimated(a, 'daysToExpiry');
  const bHasUnestimatedExpiry = Number.isFinite(b.daysToExpiry) && !isQuoteFieldEstimated(b, 'daysToExpiry');
  if (aHasUnestimatedExpiry !== bHasUnestimatedExpiry) return aHasUnestimatedExpiry ? -1 : 1;
  if (aHasUnestimatedExpiry && bHasUnestimatedExpiry) {
    return Math.abs(a.daysToExpiry - 30) - Math.abs(b.daysToExpiry - 30);
  }
  return 0;
}

/**
 * Return a small, direction-neutral watchlist of valid two-sided quote rows.
 * It prefers unestimated 20–40 DTE and unestimated |delta| 0.25–0.75 when
 * available, ranking only quote width and displayed OI/volume—not expected return or probability.
 */
export function getReviewCandidates(quotes: OptionQuote[], limit = 3): OptionQuote[] {
  const count = Math.max(1, Math.floor(limit));
  const unique = getLatestQuotePerContract(quotes);
  const validQuotes = unique.filter((quote) => quote.bid > 0 && quote.ask > 0 && quote.ask >= quote.bid
    && Number.isFinite(getSpreadPct(quote)));
  if (!validQuotes.length) return [];

  const nearExpiry = validQuotes.filter((quote) => !isQuoteFieldEstimated(quote, 'daysToExpiry')
    && quote.daysToExpiry >= 20 && quote.daysToExpiry <= 40);
  const datedPool = nearExpiry.length ? nearExpiry : validQuotes;
  const nearAtm = datedPool.filter((quote) => !isQuoteFieldEstimated(quote, 'delta')
    && Number.isFinite(quote.delta) && Math.abs(quote.delta) <= 1
    && Math.abs(quote.delta) >= 0.25 && Math.abs(quote.delta) <= 0.75);
  const pool = [...(nearAtm.length ? nearAtm : datedPool)].sort(compareReviewQuality);
  const fallbackPool = [...datedPool].sort(compareReviewQuality);
  const chosen: OptionQuote[] = [];

  (['CALL', 'PUT'] as OptionSide[]).forEach((type) => {
    const candidate = pool.find((quote) => quote.type === type)
      ?? fallbackPool.find((quote) => quote.type === type);
    if (candidate) chosen.push(candidate);
  });
  [...pool, ...fallbackPool].forEach((quote) => {
    if (chosen.length < count && !chosen.some((candidate) => candidate.id === quote.id)) chosen.push(quote);
  });

  return chosen.sort(compareReviewQuality).slice(0, count);
}

export function getComparableIvSpreadPoints(comparison: DeltaSkewComparison): number {
  return comparison.putMinusCallIv * 100;
}
