import type { OptionQuote } from './types.ts';

export const IV_HISTORY_SCHEMA_VERSION = 1 as const;
export const BINANCE_MARK_IV_SOURCE = 'https://eapi.binance.com/eapi/v1/mark';
export const DEFAULT_IV_LOOKBACK_DAYS = 365;
export const DEFAULT_IV_MINIMUM_SAMPLES = 30;
export const DEFAULT_IV_FRESHNESS_MS = 5 * 60_000;

export type IVHistorySource = 'BINANCE_REST_MARK' | 'USER_IMPORT' | 'SYNTHETIC';
export type IVHistoryConvention =
  | 'ATM_30D_VARIANCE_INTERPOLATED'
  | 'ATM_30D_EXACT'
  | 'BID_IV_30D'
  | 'ASK_IV_30D';

export interface IVHistoryObservation {
  schemaVersion: typeof IV_HISTORY_SCHEMA_VERSION;
  id: string;
  underlying: string;
  venue: string;
  convention: IVHistoryConvention | string;
  iv: number;
  tenorDays: number;
  capturedAt: string;
  receivedAt: string;
  source: IVHistorySource;
  sourceRef: string;
  contractCount: number;
  expiryCount: number;
}

export type IVRankStatus = 'AVAILABLE' | 'INSUFFICIENT_HISTORY' | 'FLAT_RANGE' | 'INVALID_CURRENT' | 'STALE_CURRENT';

export interface IVRankPercentileResult {
  status: IVRankStatus;
  rank: number | null;
  percentile: number | null;
  currentIV: number | null;
  minimumIV: number | null;
  maximumIV: number | null;
  sampleCount: number;
  minimumSamples: number;
  lookbackDays: number;
  coverageDays: number;
  isPartialHistory: boolean;
  lookbackStart: string;
  lookbackEnd: string;
}

export type ObservedAtmIVResult =
  | { ok: true; observation: IVHistoryObservation }
  | { ok: false; reason: 'INVALID_AS_OF' | 'NO_VALID_MARK_IV_QUOTES' | 'NO_ATM_CALL_PUT_PAIRS' | 'NO_30D_BRACKETING_EXPIRIES' | 'AMBIGUOUS_UNDERLYING' };

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidIVHistoryObservation(value: unknown): value is IVHistoryObservation {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<IVHistoryObservation>;
  return item.schemaVersion === IV_HISTORY_SCHEMA_VERSION
    && typeof item.id === 'string' && item.id.length > 0
    && typeof item.underlying === 'string' && /^[A-Z0-9]{2,16}$/.test(item.underlying)
    && typeof item.venue === 'string' && item.venue.length > 0
    && typeof item.convention === 'string' && item.convention.length > 0
    && typeof item.iv === 'number' && Number.isFinite(item.iv) && item.iv > 0 && item.iv <= 5
    && typeof item.tenorDays === 'number' && Number.isFinite(item.tenorDays) && item.tenorDays > 0
    && typeof item.capturedAt === 'string' && parseTime(item.capturedAt) !== null
    && typeof item.receivedAt === 'string' && parseTime(item.receivedAt) !== null
    && item.source === 'BINANCE_REST_MARK'
    && item.sourceRef === BINANCE_MARK_IV_SOURCE
    && Number.isSafeInteger(item.contractCount) && item.contractCount > 0
    && Number.isSafeInteger(item.expiryCount) && item.expiryCount > 0;
}

function observationKey(item: IVHistoryObservation): string {
  return [item.underlying, item.venue, item.convention, item.source, item.sourceRef].join('|');
}

/** Select the latest valid observation per UTC day and series key. */
export function selectDailyIVObservations(
  observations: readonly IVHistoryObservation[],
  asOf: string,
  lookbackDays = DEFAULT_IV_LOOKBACK_DAYS,
): IVHistoryObservation[] {
  const asOfMs = parseTime(asOf);
  if (asOfMs === null || !Number.isSafeInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 3_650) return [];
  const startMs = asOfMs - lookbackDays * 86_400_000;
  const daily = new Map<string, IVHistoryObservation>();

  for (const item of observations) {
    if (!isValidIVHistoryObservation(item)) continue;
    const capturedAt = parseTime(item.capturedAt);
    const receivedAt = parseTime(item.receivedAt);
    if (capturedAt === null || receivedAt === null || capturedAt > asOfMs || receivedAt > asOfMs
      || capturedAt > receivedAt || capturedAt < startMs) continue;
    const day = new Date(capturedAt).toISOString().slice(0, 10);
    const key = observationKey(item) + '|' + day;
    const previous = daily.get(key);
    if (!previous || Date.parse(item.capturedAt) > Date.parse(previous.capturedAt)
      || (item.capturedAt === previous.capturedAt && item.id > previous.id)) daily.set(key, item);
  }

  return [...daily.values()].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export function computeIVRankPercentile(
  history: readonly IVHistoryObservation[],
  current: IVHistoryObservation,
  asOf: string,
  options: { lookbackDays?: number; minimumSamples?: number; currentFreshnessMs?: number } = {},
): IVRankPercentileResult {
  const asOfMs = parseTime(asOf);
  const lookbackDays = options.lookbackDays ?? DEFAULT_IV_LOOKBACK_DAYS;
  const minimumSamples = options.minimumSamples ?? DEFAULT_IV_MINIMUM_SAMPLES;
  const currentFreshnessMs = options.currentFreshnessMs ?? DEFAULT_IV_FRESHNESS_MS;
  const invalid = asOfMs === null
    || !Number.isSafeInteger(lookbackDays) || lookbackDays < 1 || lookbackDays > 3_650
    || !Number.isSafeInteger(minimumSamples) || minimumSamples < 2
    || !Number.isFinite(currentFreshnessMs) || currentFreshnessMs < 0
    || !isValidIVHistoryObservation(current);
  const empty = (status: IVRankStatus): IVRankPercentileResult => ({
    status, rank: null, percentile: null, currentIV: isValidIVHistoryObservation(current) ? current.iv : null,
    minimumIV: null, maximumIV: null, sampleCount: 0, minimumSamples, lookbackDays,
    coverageDays: 0, isPartialHistory: true,
    lookbackStart: asOfMs === null ? '' : new Date(asOfMs - lookbackDays * 86_400_000).toISOString(),
    lookbackEnd: asOfMs === null ? '' : new Date(asOfMs).toISOString(),
  });
  if (invalid) return empty('INVALID_CURRENT');

  const currentCaptured = parseTime(current.capturedAt)!;
  const currentReceived = parseTime(current.receivedAt)!;
  if (currentCaptured > asOfMs! || currentReceived > asOfMs! || currentCaptured > currentReceived) return empty('INVALID_CURRENT');
  if (asOfMs! - currentReceived > currentFreshnessMs) return empty('STALE_CURRENT');

  const matching = history.filter((item) => isValidIVHistoryObservation(item) && observationKey(item) === observationKey(current));
  const daily = selectDailyIVObservations([...matching, current], asOf, lookbackDays);
  const currentDay = new Date(currentCaptured).toISOString().slice(0, 10);
  const selectedCurrent = daily.find((item) => new Date(item.capturedAt).toISOString().slice(0, 10) === currentDay);
  if (!selectedCurrent || selectedCurrent.id !== current.id) return empty('STALE_CURRENT');

  const samples = daily.filter((item) => observationKey(item) === observationKey(current));
  const values = samples.map((item) => item.iv);
  const minimumIV = values.length ? Math.min(...values) : null;
  const maximumIV = values.length ? Math.max(...values) : null;
  const coverageDays = samples.length > 1
    ? Math.floor((Date.parse(samples[samples.length - 1].capturedAt) - Date.parse(samples[0].capturedAt)) / 86_400_000) + 1
    : samples.length;
  const isPartialHistory = samples.length < lookbackDays;
  const base = {
    currentIV: current.iv, minimumIV, maximumIV, sampleCount: samples.length, minimumSamples,
    lookbackDays, coverageDays, isPartialHistory,
    lookbackStart: new Date(asOfMs! - lookbackDays * 86_400_000).toISOString(),
    lookbackEnd: new Date(asOfMs!).toISOString(),
  };

  if (samples.length < minimumSamples) return { ...base, status: 'INSUFFICIENT_HISTORY', rank: null, percentile: null };
  const percentile = (values.filter((value) => value < current.iv).length / values.length) * 100;
  if (minimumIV === null || maximumIV === null || maximumIV - minimumIV <= Number.EPSILON) {
    return { ...base, status: 'FLAT_RANGE', rank: null, percentile };
  }
  const rank = ((current.iv - minimumIV) / (maximumIV - minimumIV)) * 100;
  return { ...base, status: 'AVAILABLE', rank, percentile };
}

interface AtmExpiryPoint {
  daysToExpiry: number;
  iv: number;
  capturedAt: number;
  contractCount: number;
  expiry: string;
}

function validObservedMarkQuote(quote: OptionQuote, asOfMs: number, freshnessMs: number): boolean {
  if (quote.ivStatus !== 'OBSERVED' || quote.markIvSource !== 'REST_MARK'
    || quote.estimatedFields?.includes('iv') || quote.estimatedFields?.includes('daysToExpiry')
    || typeof quote.underlying !== 'string' || typeof quote.venue !== 'string' || !quote.venue
    || !Number.isFinite(quote.iv) || quote.iv <= 0 || quote.iv > 5
    || !Number.isFinite(quote.daysToExpiry) || quote.daysToExpiry <= 0
    || !Number.isFinite(quote.strike) || quote.strike <= 0
    || !Number.isFinite(quote.spot) || quote.spot <= 0) return false;
  const receivedAt = parseTime(quote.sourceReceivedAt?.markIv);
  const indexAt = parseTime(quote.sourceTimestamps?.index);
  if (receivedAt === null || indexAt === null || receivedAt > asOfMs || indexAt > asOfMs
    || asOfMs - receivedAt > freshnessMs || asOfMs - indexAt > freshnessMs) return false;
  return true;
}

/**
 * Build an observed 30-day ATM mark-IV point. It requires paired call/put
 * quotes at the same strike and expiry, fresh REST mark-IV and index clocks,
 * then interpolates total variance between expiries bracketing 30 days.
 */
export function extractObservedAtm30DayIV(
  quotes: readonly OptionQuote[],
  asOf: string,
  freshnessMs = DEFAULT_IV_FRESHNESS_MS,
): ObservedAtmIVResult {
  const asOfMs = parseTime(asOf);
  if (asOfMs === null || !Number.isFinite(freshnessMs) || freshnessMs < 0) return { ok: false, reason: 'INVALID_AS_OF' };
  const valid = quotes.filter((quote) => validObservedMarkQuote(quote, asOfMs, freshnessMs));
  if (!valid.length) return { ok: false, reason: 'NO_VALID_MARK_IV_QUOTES' };

  const seriesKeys = new Set(valid.map((quote) => quote.venue + '|' + quote.underlying));
  if (seriesKeys.size !== 1) return { ok: false, reason: 'AMBIGUOUS_UNDERLYING' };

  const groups = new Map<string, OptionQuote[]>();
  for (const quote of valid) {
    const key = [quote.venue, quote.underlying, quote.expiry, quote.strike].join('|');
    const group = groups.get(key) ?? [];
    group.push(quote);
    groups.set(key, group);
  }

  const pointsByExpiry = new Map<string, AtmExpiryPoint[]>();
  for (const group of groups.values()) {
    const call = group.find((quote) => quote.type === 'CALL');
    const put = group.find((quote) => quote.type === 'PUT');
    if (!call || !put) continue;
    const callReceived = parseTime(call.sourceReceivedAt?.markIv)!;
    const putReceived = parseTime(put.sourceReceivedAt?.markIv)!;
    const callIndex = parseTime(call.sourceTimestamps?.index)!;
    const putIndex = parseTime(put.sourceTimestamps?.index)!;
    if (Math.abs(callReceived - putReceived) > 60_000 || Math.abs(callIndex - putIndex) > 60_000
      || Math.abs(call.daysToExpiry - put.daysToExpiry) > 0.1
      || Math.abs(call.spot - put.spot) / Math.max(call.spot, put.spot) > 0.01) continue;
    const spot = (call.spot + put.spot) / 2;
    const moneyness = Math.abs(call.strike / spot - 1);
    if (moneyness > 0.05) continue;
    const expiryMs = parseTime(call.expiry);
    if (expiryMs === null || Math.abs((expiryMs - asOfMs) / 86_400_000 - call.daysToExpiry) > 1.5) continue;
    const point: AtmExpiryPoint = {
      daysToExpiry: (call.daysToExpiry + put.daysToExpiry) / 2,
      iv: (call.iv + put.iv) / 2,
      capturedAt: Math.max(callReceived, putReceived),
      contractCount: 2,
      expiry: call.expiry,
    };
    const rows = pointsByExpiry.get(call.expiry) ?? [];
    rows.push(point);
    pointsByExpiry.set(call.expiry, rows);
  }

  const points = [...pointsByExpiry.values()].map((rows) => rows.sort((a, b) => a.daysToExpiry - b.daysToExpiry)[0])
    .filter((point): point is AtmExpiryPoint => Boolean(point))
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
  if (!points.length) return { ok: false, reason: 'NO_ATM_CALL_PUT_PAIRS' };

  const exact = points.find((point) => Math.abs(point.daysToExpiry - 30) <= 0.5);
  let iv: number;
  let selected: AtmExpiryPoint[];
  let convention: IVHistoryConvention;
  if (exact) {
    iv = exact.iv;
    selected = [exact];
    convention = 'ATM_30D_EXACT';
  } else {
    const before = [...points].reverse().find((point) => point.daysToExpiry < 30);
    const after = points.find((point) => point.daysToExpiry > 30);
    if (!before || !after) return { ok: false, reason: 'NO_30D_BRACKETING_EXPIRIES' };
    const varianceBefore = before.iv * before.iv * before.daysToExpiry;
    const varianceAfter = after.iv * after.iv * after.daysToExpiry;
    const varianceAt30 = varianceBefore
      + ((varianceAfter - varianceBefore) * (30 - before.daysToExpiry) / (after.daysToExpiry - before.daysToExpiry));
    iv = Math.sqrt(varianceAt30 / 30);
    selected = [before, after];
    convention = 'ATM_30D_VARIANCE_INTERPOLATED';
  }

  const capturedAt = Math.max(...selected.map((point) => point.capturedAt));
  const capturedAtIso = new Date(capturedAt).toISOString();
  const first = valid[0];
  return {
    ok: true,
    observation: {
      schemaVersion: IV_HISTORY_SCHEMA_VERSION,
      id: ['BINANCE', first.underlying, convention, capturedAtIso].join(':'),
      underlying: first.underlying,
      venue: first.venue.toUpperCase(),
      convention,
      iv,
      tenorDays: 30,
      capturedAt: capturedAtIso,
      receivedAt: capturedAtIso,
      source: 'BINANCE_REST_MARK',
      sourceRef: BINANCE_MARK_IV_SOURCE,
      contractCount: selected.reduce((sum, point) => sum + point.contractCount, 0),
      expiryCount: selected.length,
    },
  };
}
