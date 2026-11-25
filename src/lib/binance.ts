import type { OptionFilter, OptionQuote, OptionSide, Underlying } from './types.ts';
import { impliedVolatilityForContract, priceOption } from './pricing-model.ts';
import { inferAssetClass } from './asset-class.ts';
import { mapBinanceCryptoOptionEconomics } from './binance-crypto-options-economics.ts';

const BINANCE_OPTIONS_API = 'https://eapi.binance.com';
const REQUEST_TIMEOUT_MS = 12_000;

interface BinanceOptionContract {
  baseAsset?: string;
  quoteAsset?: string;
  underlying?: string;
  settleAsset?: string;
  contractType?: string;
  underlyingType?: string;
}

interface BinanceOptionSymbol {
  symbol?: string;
  underlying?: string;
  quoteAsset?: string;
  side?: string;
  strikePrice?: string | number;
  expiryDate?: string | number;
  unit?: string | number;
  minQty?: string | number;
  maxQty?: string | number;
  makerFeeRate?: string | number;
  takerFeeRate?: string | number;
  priceScale?: string | number;
  quantityScale?: string | number;
  status?: string;
  filters?: OptionFilter[];
  contractType?: string;
  underlyingType?: string;
}

interface BinanceExchangeInfo {
  serverTime?: number;
  optionContracts?: BinanceOptionContract[];
  optionSymbols?: BinanceOptionSymbol[];
}

interface BinanceMark {
  symbol?: string;
  markPrice?: string | number;
  bidIV?: string | number;
  askIV?: string | number;
  markIV?: string | number;
  delta?: string | number;
  gamma?: string | number;
  theta?: string | number;
  vega?: string | number;
  riskFreeInterest?: string | number;
}

interface BinanceDepthResponse {
  lastUpdateId?: number | string;
  T?: number | string;
  bids?: Array<[string | number, string | number]>;
  asks?: Array<[string | number, string | number]>;
}

export interface BinanceDepthLevel {
  price: number;
  quantity: number;
}

export interface BinanceDepthSnapshot {
  symbol: string;
  lastUpdateId?: number;
  transactionTime?: number;
  fetchedAt: number;
  bids: BinanceDepthLevel[];
  asks: BinanceDepthLevel[];
}

interface BinanceTicker {
  symbol?: string;
  bidPrice?: string | number;
  askPrice?: string | number;
  lastPrice?: string | number;
  volume?: string | number;
  amount?: string | number;
  closeTime?: number;
}

interface BinanceIndex {
  underlying?: string;
  indexPrice?: string | number;
  time?: number;
}

interface BinanceOpenInterest {
  symbol?: string;
  sumOpenInterest?: string | number;
  sumOpenInterestUsd?: string | number;
  timestamp?: string | number;
}

export interface BinanceOptionsSnapshot {
  quotes: OptionQuote[];
  fetchedAt: number;
  serverTime: number;
  availableAssets: Underlying[];
  activeSymbols: number;
  warnings: string[];
}

export class BinanceMarketDataError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(status: number, detail?: string) {
    super(`Binance market-data service returned HTTP ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'BinanceMarketDataError';
    this.status = status;
    this.detail = detail;
  }
}

export interface BinanceFixture {
  exchangeInfo: BinanceExchangeInfo;
  marks?: BinanceMark[];
  tickers?: BinanceTicker[];
  indices?: Array<{ requestedUnderlying: string; item: BinanceIndex }>;
  openInterest?: BinanceOpenInterest[];
  fetchedAt?: number;
}


export interface BinanceBookTickerEvent {
  symbol: string;
  bidPrice: number;
  bidQuantity: number;
  askPrice: number;
  askQuantity: number;
  eventTime?: number;
  transactionTime?: number;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function finiteNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveNumber(value: string | number | undefined): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

/** Parse raw or combined public Binance bookTicker stream messages without inventing missing sides. */
export function parseBinanceBookTickerMessage(payload: unknown): BinanceBookTickerEvent | null {
  let decoded = payload;
  if (typeof decoded === 'string') {
    try { decoded = JSON.parse(decoded) as unknown; } catch { return null; }
  }
  if (!decoded || typeof decoded !== 'object') return null;
  const envelope = decoded as Record<string, unknown>;
  const data = envelope.data && typeof envelope.data === 'object'
    ? envelope.data as Record<string, unknown>
    : envelope;
  if (data.e !== 'bookTicker' || typeof data.s !== 'string' || !data.s) return null;
  const bidPrice = finiteNumber(data.b as string | number | undefined);
  const askPrice = finiteNumber(data.a as string | number | undefined);
  const bidQuantity = finiteNumber(data.B as string | number | undefined);
  const askQuantity = finiteNumber(data.A as string | number | undefined);
  if (bidPrice === undefined || bidPrice < 0 || askPrice === undefined || askPrice < 0
    || bidQuantity === undefined || bidQuantity < 0 || askQuantity === undefined || askQuantity < 0) return null;
  const eventTime = finiteNumber(data.E as string | number | undefined);
  const transactionTime = positiveNumber(data.T as string | number | undefined);
  return {
    symbol: data.s,
    bidPrice,
    bidQuantity,
    askPrice,
    askQuantity,
    ...(eventTime !== undefined ? { eventTime } : {}),
    ...(transactionTime !== undefined ? { transactionTime } : {}),
  };
}

/** Apply a provider event to the matching quote while preserving independent source timestamps. */
export function applyBinanceBookTicker(quote: OptionQuote, event: BinanceBookTickerEvent): OptionQuote {
  const timestamp = event.transactionTime ?? event.eventTime;
  const currentBboTimestamp = quote.bidAskSource === 'OPTION_TICKER'
    ? Date.parse(quote.sourceTimestamps?.optionTicker ?? '')
    : quote.bidAskSource === 'MARK_PRICE'
      ? Date.parse(quote.sourceTimestamps?.markPrice ?? '')
      : quote.bidAskSource === 'BOOK_TICKER'
        ? Date.parse(quote.sourceTimestamps?.bookTicker ?? '')
        : Number.NaN;
  if (timestamp !== undefined && Number.isFinite(currentBboTimestamp) && timestamp < currentBboTimestamp) return quote;
  return {
    ...quote,
    bid: event.bidPrice,
    ask: event.askPrice,
    sourceTimestamps: {
      ...quote.sourceTimestamps,
      ...(timestamp !== undefined && timestamp > 0 ? { bookTicker: new Date(timestamp).toISOString(), bidAsk: new Date(timestamp).toISOString() } : {}),
    },
    bidQuantity: event.bidQuantity,
    askQuantity: event.askQuantity,
    bidAskSource: 'BOOK_TICKER',
  };
}

export interface BinanceOptionMarkPriceEvent {
  symbol: string;
  eventTime: number;
  markPrice: number;
  indexPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  bestBidQuantity?: number;
  bestAskQuantity?: number;
  bidIv?: number;
  askIv?: number;
  /** Binance websocket vo is venue volatility, not markIV. */
  venueVolatility?: number;
  riskFreeRate?: number;
  sourceGreeks: { delta?: number; gamma?: number; theta?: number; vega?: number };
}

export interface BinanceOptionTickerEvent {
  symbol: string;
  eventTime: number;
  transactionTime?: number;
  lastPrice?: number;
  lastQuantity?: number;
  volume?: number;
  volumeQuote?: number;
  closeTime?: number;
  markPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  bestBidQuantity?: number;
  bestAskQuantity?: number;
  bidIv?: number;
  askIv?: number;
  /** Venue ticker field vo; not the explicit REST markIV field. */
  venueVolatility?: number;
  sourceGreeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
}

/** Parse the Options markPrice stream. Its vo field is not markIV. */
export function parseBinanceOptionMarkPriceMessage(payload: unknown): BinanceOptionMarkPriceEvent[] {
  let decoded = payload;
  if (typeof decoded === 'string') {
    try { decoded = JSON.parse(decoded) as unknown; } catch { return []; }
  }
  if (!decoded || typeof decoded !== 'object') return [];
  const envelope = decoded as Record<string, unknown>;
  const raw = envelope.data ?? decoded;
  const candidates = Array.isArray(raw) ? raw : [raw];
  return candidates.flatMap((candidate): BinanceOptionMarkPriceEvent[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const data = candidate as Record<string, unknown>;
    if (data.e !== 'markPrice' || typeof data.s !== 'string' || !data.s) return [];
    const eventTime = finiteNumber(data.E as string | number | undefined);
    const markPrice = positiveNumber(data.mp as string | number | undefined);
    if (eventTime === undefined || eventTime <= 0 || markPrice === undefined) return [];
    const indexPrice = positiveNumber(data.i as string | number | undefined);
    const bestBid = positiveNumber(data.bo as string | number | undefined);
    const bestAsk = positiveNumber(data.ao as string | number | undefined);
    const bestBidQuantity = finiteNumber(data.bq as string | number | undefined);
    const bestAskQuantity = finiteNumber(data.aq as string | number | undefined);
    const bidIv = positiveNumber(data.b as string | number | undefined);
    const askIv = positiveNumber(data.a as string | number | undefined);
    const venueVolatility = positiveNumber(data.vo as string | number | undefined);
    const riskFreeRate = finiteNumber(data.rf as string | number | undefined);
    const sourceGreeks = {
      delta: finiteNumber(data.d as string | number | undefined),
      gamma: finiteNumber(data.g as string | number | undefined),
      theta: finiteNumber(data.t as string | number | undefined),
      vega: finiteNumber(data.v as string | number | undefined),
    };
    return [{
      symbol: data.s,
      eventTime,
      markPrice,
      ...(indexPrice !== undefined ? { indexPrice } : {}),
      ...(bestBid !== undefined ? { bestBid } : {}),
      ...(bestAsk !== undefined ? { bestAsk } : {}),
      ...(bestBidQuantity !== undefined && bestBidQuantity >= 0 ? { bestBidQuantity } : {}),
      ...(bestAskQuantity !== undefined && bestAskQuantity >= 0 ? { bestAskQuantity } : {}),
      ...(bidIv !== undefined ? { bidIv } : {}),
      ...(askIv !== undefined ? { askIv } : {}),
      ...(venueVolatility !== undefined ? { venueVolatility } : {}),
      ...(riskFreeRate !== undefined ? { riskFreeRate } : {}),
      sourceGreeks,
    }];
  });
}

/** Parse only documented 24-hour ticker fields; never treat its payload as a mark/IV event. */
export function parseBinanceOptionTickerMessage(payload: unknown): BinanceOptionTickerEvent[] {
  let decoded = payload;
  if (typeof decoded === 'string') {
    try { decoded = JSON.parse(decoded) as unknown; } catch { return []; }
  }
  if (!decoded || typeof decoded !== 'object') return [];
  const envelope = decoded as Record<string, unknown>;
  const raw = envelope.data ?? decoded;
  const candidates = Array.isArray(raw) ? raw : [raw];
  return candidates.flatMap((candidate): BinanceOptionTickerEvent[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const data = candidate as Record<string, unknown>;
    if (data.e !== '24hrTicker' || typeof data.s !== 'string' || !data.s) return [];
    const eventTime = finiteNumber(data.E as string | number | undefined);
    if (eventTime === undefined || eventTime <= 0) return [];
    const transactionTime = finiteNumber(data.T as string | number | undefined);
    const lastPrice = positiveNumber(data.c as string | number | undefined);
    const lastQuantity = finiteNumber(data.Q as string | number | undefined);
    const volume = finiteNumber(data.V as string | number | undefined);
    const volumeQuote = finiteNumber(data.A as string | number | undefined);
    const closeTime = finiteNumber(data.C as string | number | undefined);
    const markPrice = positiveNumber(data.mp as string | number | undefined);
    const bestBid = positiveNumber(data.bo as string | number | undefined);
    const bestAsk = positiveNumber(data.ao as string | number | undefined);
    const bestBidQuantity = finiteNumber(data.bq as string | number | undefined);
    const bestAskQuantity = finiteNumber(data.aq as string | number | undefined);
    const bidIv = positiveNumber(data.b as string | number | undefined);
    const askIv = positiveNumber(data.a as string | number | undefined);
    const venueVolatility = positiveNumber(data.vo as string | number | undefined);
    const sourceGreeks = {
      delta: finiteNumber(data.d as string | number | undefined),
      gamma: finiteNumber(data.g as string | number | undefined),
      theta: finiteNumber(data.t as string | number | undefined),
      vega: finiteNumber(data.v as string | number | undefined),
    };
    if (![lastPrice, lastQuantity, volume, volumeQuote, closeTime, markPrice, bestBid, bestAsk, bidIv, askIv, venueVolatility, ...Object.values(sourceGreeks)].some(Number.isFinite)) return [];
    return [{
      symbol: data.s,
      eventTime,
      ...(transactionTime !== undefined && transactionTime > 0 ? { transactionTime } : {}),
      ...(lastPrice !== undefined ? { lastPrice } : {}),
      ...(lastQuantity !== undefined && lastQuantity >= 0 ? { lastQuantity } : {}),
      ...(volume !== undefined && volume >= 0 ? { volume } : {}),
      ...(volumeQuote !== undefined && volumeQuote >= 0 ? { volumeQuote } : {}),
      ...(closeTime !== undefined && closeTime > 0 ? { closeTime } : {}),
      ...(markPrice !== undefined ? { markPrice } : {}),
      ...(bestBid !== undefined ? { bestBid } : {}),
      ...(bestAsk !== undefined ? { bestAsk } : {}),
      ...(bestBidQuantity !== undefined && bestBidQuantity >= 0 ? { bestBidQuantity } : {}),
      ...(bestAskQuantity !== undefined && bestAskQuantity >= 0 ? { bestAskQuantity } : {}),
      ...(bidIv !== undefined ? { bidIv } : {}),
      ...(askIv !== undefined ? { askIv } : {}),
      ...(venueVolatility !== undefined ? { venueVolatility } : {}),
      sourceGreeks,
    }];
  });
}

/** Apply 24-hour ticker statistics only; it is not a book, mark or IV source. */
export function applyBinanceOptionTicker(quote: OptionQuote, event: BinanceOptionTickerEvent): OptionQuote {
  const marketTimestamp = event.transactionTime ?? event.eventTime;
  const previousTimestamp = quote.sourceTimestamps?.optionTicker
    ? new Date(quote.sourceTimestamps.optionTicker).getTime()
    : 0;
  if (marketTimestamp < previousTimestamp) return quote;
  const currentBboTimestamp = quote.bidAskSource === 'BOOK_TICKER'
    ? Date.parse(quote.sourceTimestamps?.bookTicker ?? '')
    : quote.bidAskSource === 'MARK_PRICE'
      ? Date.parse(quote.sourceTimestamps?.markPrice ?? '')
      : quote.bidAskSource === 'OPTION_TICKER'
        ? Date.parse(quote.sourceTimestamps?.optionTicker ?? '')
        : Number.NaN;
  const updateBbo = !Number.isFinite(currentBboTimestamp) || marketTimestamp >= currentBboTimestamp;
  const currentMarkTimestamp = Date.parse(quote.sourceTimestamps?.markPrice ?? '');
  const updateMark = event.markPrice !== undefined
    && (!Number.isFinite(currentMarkTimestamp) || marketTimestamp >= currentMarkTimestamp);
  const useTickerBid = updateBbo && event.bestBid !== undefined;
  const useTickerAsk = updateBbo && event.bestAsk !== undefined;
  return {
    ...quote,
    ...(event.lastPrice !== undefined ? {
      lastPrice: event.lastPrice,
      ...(quote.priceSource === 'LAST' && !updateMark ? { markPrice: event.lastPrice } : {}),
    } : {}),
    ...(updateMark ? { markPrice: event.markPrice, priceSource: 'MARK' as const } : {}),
    ...(useTickerBid ? { bid: event.bestBid, ...(event.bestBidQuantity !== undefined ? { bidQuantity: event.bestBidQuantity } : {}) } : {}),
    ...(useTickerAsk ? { ask: event.bestAsk, ...(event.bestAskQuantity !== undefined ? { askQuantity: event.bestAskQuantity } : {}) } : {}),
    ...(useTickerBid || useTickerAsk ? { bidAskSource: useTickerBid && useTickerAsk ? 'OPTION_TICKER' as const : undefined } : {}),
    ...(event.bidIv !== undefined ? { bidIv: event.bidIv } : {}),
    ...(event.askIv !== undefined ? { askIv: event.askIv } : {}),
    ...(event.venueVolatility !== undefined ? { venueVolatility: event.venueVolatility } : {}),
    ...(event.sourceGreeks && Object.values(event.sourceGreeks).some(Number.isFinite)
      ? { unverifiedSourceGreeks: { ...quote.unverifiedSourceGreeks, ...event.sourceGreeks } }
      : {}),
    ...(quote.estimatedFields ? {
      estimatedFields: quote.estimatedFields.filter((field) => !(
        (updateMark && field === 'markPrice')
        || (useTickerBid && field === 'bid')
        || (useTickerAsk && field === 'ask')
        || (event.bidIv !== undefined && field === 'bidIv')
        || (event.askIv !== undefined && field === 'askIv')
      )),
    } : {}),
    ...(event.lastQuantity !== undefined ? { lastQuantity: event.lastQuantity } : {}),
    ...(event.volume !== undefined ? { volume: event.volume } : {}),
    ...(event.volumeQuote !== undefined ? { volumeQuote: event.volumeQuote } : {}),
    sourceTimestamps: {
      ...quote.sourceTimestamps,
      optionTicker: new Date(marketTimestamp).toISOString(),
      ...(useTickerBid || useTickerAsk ? { bidAsk: new Date(marketTimestamp).toISOString() } : {}),
      ...(event.closeTime !== undefined ? { ticker: new Date(event.closeTime).toISOString() } : {}),
      ...(updateMark ? { markPrice: new Date(marketTimestamp).toISOString() } : {}),
      ...(event.venueVolatility !== undefined ? { venueVolatility: new Date(marketTimestamp).toISOString() } : {}),
      ...(event.bidIv !== undefined ? { bidIv: new Date(marketTimestamp).toISOString() } : {}),
      ...(event.askIv !== undefined ? { askIv: new Date(marketTimestamp).toISOString() } : {}),
    },
  };
}

/** Apply markPrice/index/rate updates; venue vo remains distinct from markIV. */
export function applyBinanceOptionMarkPrice(
  quote: OptionQuote,
  event: BinanceOptionMarkPriceEvent,
  nowMs = Date.now(),
): OptionQuote {
  const previousTimestamp = quote.sourceTimestamps?.markPrice
    ? new Date(quote.sourceTimestamps.markPrice).getTime()
    : 0;
  if (event.eventTime < previousTimestamp) return quote;

  const currentBboTimestamp = quote.bidAskSource === 'BOOK_TICKER'
    ? Date.parse(quote.sourceTimestamps?.bookTicker ?? '')
    : quote.bidAskSource === 'OPTION_TICKER'
      ? Date.parse(quote.sourceTimestamps?.optionTicker ?? '')
      : quote.bidAskSource === 'MARK_PRICE'
        ? Date.parse(quote.sourceTimestamps?.markPrice ?? '')
        : Number.NaN;
  const updateBbo = !Number.isFinite(currentBboTimestamp) || event.eventTime >= currentBboTimestamp;
  const useMarkBid = updateBbo && event.bestBid !== undefined;
  const useMarkAsk = updateBbo && event.bestAsk !== undefined;
  const updated: OptionQuote = {
    ...quote,
    markPrice: event.markPrice,
    priceSource: 'MARK',
    ...(event.indexPrice !== undefined ? { spot: event.indexPrice } : {}),
    ...(useMarkBid ? { bid: event.bestBid, ...(event.bestBidQuantity !== undefined ? { bidQuantity: event.bestBidQuantity } : {}) } : {}),
    ...(useMarkAsk ? { ask: event.bestAsk, ...(event.bestAskQuantity !== undefined ? { askQuantity: event.bestAskQuantity } : {}) } : {}),
    ...(useMarkBid || useMarkAsk ? { bidAskSource: useMarkBid && useMarkAsk ? 'MARK_PRICE' as const : undefined } : {}),
    ...(event.bidIv !== undefined ? { bidIv: event.bidIv } : {}),
    ...(event.askIv !== undefined ? { askIv: event.askIv } : {}),
    ...(event.venueVolatility !== undefined ? { venueVolatility: event.venueVolatility } : {}),
    ...(event.riskFreeRate !== undefined ? {
      riskFreeRate: event.riskFreeRate,
      riskFreeRateSource: 'MARK_PRICE' as const,
      sourceReceivedAt: { ...quote.sourceReceivedAt, riskFreeRate: undefined },
    } : {}),
    ...(Object.values(event.sourceGreeks).some(Number.isFinite)
      ? { unverifiedSourceGreeks: { ...quote.unverifiedSourceGreeks, ...event.sourceGreeks } }
      : {}),
    ...(quote.estimatedFields ? {
      estimatedFields: quote.estimatedFields.filter((field) => !(
        (event.indexPrice !== undefined && field === 'spot')
        || (event.riskFreeRate !== undefined && field === 'riskFreeRate')
        || (event.bidIv !== undefined && field === 'bidIv')
        || (event.askIv !== undefined && field === 'askIv')
        || (useMarkBid && field === 'bid')
        || (useMarkAsk && field === 'ask')
        || field === 'markPrice'
      )),
    } : {}),
    sourceTimestamps: {
      ...quote.sourceTimestamps,
      markPrice: new Date(event.eventTime).toISOString(),
      ...(useMarkBid || useMarkAsk ? { bidAsk: new Date(event.eventTime).toISOString() } : {}),
      ...(event.indexPrice !== undefined ? { index: new Date(event.eventTime).toISOString() } : {}),
      ...(event.venueVolatility !== undefined ? { venueVolatility: new Date(event.eventTime).toISOString() } : {}),
      ...(event.bidIv !== undefined ? { bidIv: new Date(event.eventTime).toISOString() } : {}),
      ...(event.askIv !== undefined ? { askIv: new Date(event.eventTime).toISOString() } : {}),
      ...(event.riskFreeRate !== undefined ? { riskFreeRate: new Date(event.eventTime).toISOString() } : {}),
    },
  };

  const markIvReceivedAt = Date.parse(quote.sourceReceivedAt?.markIv ?? '');
  const markIvFresh = quote.markIvSource === 'REST_MARK'
    && Number.isFinite(markIvReceivedAt)
    && nowMs >= markIvReceivedAt
    && nowMs - markIvReceivedAt <= 60_000;
  const rateReceivedAt = updated.riskFreeRateSource === 'MARK_PRICE'
    ? Date.parse(updated.sourceTimestamps?.riskFreeRate ?? '')
    : Date.parse(updated.sourceReceivedAt?.riskFreeRate ?? '');
  const rateFresh = Number.isFinite(rateReceivedAt) && nowMs >= rateReceivedAt && nowMs - rateReceivedAt <= 60_000;
  const indexReceivedAt = Date.parse(updated.sourceTimestamps?.index ?? '');
  const indexFresh = Number.isFinite(indexReceivedAt) && nowMs >= indexReceivedAt && nowMs - indexReceivedAt <= 15_000;
  const rateSourceValid = updated.riskFreeRateSource === 'REST_MARK' || updated.riskFreeRateSource === 'MARK_PRICE';
  const modelUpdate = markIvFresh && rateFresh && indexFresh && rateSourceValid && updated.ivStatus === 'OBSERVED'
    && !updated.estimatedFields?.includes('iv')
    && Number.isFinite(updated.riskFreeRate)
    ? priceOption({ ...updated, volatility: updated.iv, rate: updated.riskFreeRate! })
    : undefined;

  if (modelUpdate?.status === 'SUPPORTED') {
    Object.assign(updated, {
      delta: modelUpdate.greeks.delta,
      gamma: modelUpdate.greeks.gamma,
      theta: modelUpdate.greeks.thetaPerDay,
      vega: modelUpdate.greeks.vegaPerVolPoint,
      rho: modelUpdate.greeks.rhoPerRatePoint,
      pricingStatus: 'ASSUMED',
      pricingModel: modelUpdate.model,
      estimatedFields: updated.estimatedFields?.filter((field) => !['delta', 'gamma', 'theta', 'vega', 'rho'].includes(field)),
    });
  } else {
    Object.assign(updated, {
      delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0,
      pricingStatus: 'OBSERVED_ONLY',
      pricingModel: undefined,
      pricingReason: 'Observed markIV or risk-free input is missing/stale; model Greeks are withheld.',
      estimatedFields: [...new Set([...(updated.estimatedFields ?? []), 'delta', 'gamma', 'theta', 'vega', 'rho'])],
    });
  }
  return updated;
}

interface BinanceIndex {
  underlying?: string;
  indexPrice?: string | number;
  time?: number;
}

interface BinanceOpenInterest {
  symbol?: string;
  sumOpenInterest?: string | number;
  sumOpenInterestUsd?: string | number;
  timestamp?: string | number;
}

export interface BinanceOptionsSnapshot {
  quotes: OptionQuote[];
  fetchedAt: number;
  serverTime: number;
  availableAssets: Underlying[];
  activeSymbols: number;
  warnings: string[];
}

export class BinanceMarketDataError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(status: number, detail?: string) {
    super(`Binance market-data service returned HTTP ${status}${detail ? `: ${detail}` : ''}`);
    this.name = 'BinanceMarketDataError';
    this.status = status;
    this.detail = detail;
  }
}

export interface BinanceFixture {
  exchangeInfo: BinanceExchangeInfo;
  marks?: BinanceMark[];
  tickers?: BinanceTicker[];
  indices?: Array<{ requestedUnderlying: string; item: BinanceIndex }>;
  openInterest?: BinanceOpenInterest[];
  fetchedAt?: number;
}

function normaliseSide(value: string | undefined, symbol: string): OptionSide | undefined {
  const side = (value ?? symbol.slice(-1)).toUpperCase();
  if (side === 'CALL' || side === 'C') return 'CALL';
  if (side === 'PUT' || side === 'P') return 'PUT';
  return undefined;
}

function getBaseAsset(symbolInfo: BinanceOptionSymbol, contractsByUnderlying: Map<string, string>): string {
  const fromContract = symbolInfo.underlying ? contractsByUnderlying.get(symbolInfo.underlying.toUpperCase()) : undefined;
  if (fromContract) return fromContract.toUpperCase();
  return (symbolInfo.symbol ?? '').split('-')[0].toUpperCase();
}

function calculateOpenInterestGroups(
  symbols: BinanceOptionSymbol[],
  contractsByUnderlying: Map<string, string>,
): Array<{ baseAsset: string; expiry: string }> {
  const groups = new Map<string, { baseAsset: string; expiry: string }>();
  for (const symbolInfo of symbols) {
    const symbol = symbolInfo.symbol ?? '';
    const expiry = symbol.split('-')[1];
    const baseAsset = getBaseAsset(symbolInfo, contractsByUnderlying);
    if (!baseAsset || !/^\d{6}$/.test(expiry ?? '')) continue;
    groups.set(`${baseAsset}:${expiry}`, { baseAsset, expiry });
  }
  return [...groups.values()];
}

export function normalizeBinanceSnapshot(fixture: BinanceFixture): BinanceOptionsSnapshot {
  const fetchedAt = fixture.fetchedAt ?? Date.now();
  const serverTime = finiteNumber(fixture.exchangeInfo.serverTime) ?? fetchedAt;
  const exchangeSymbols = asArray<BinanceOptionSymbol>(fixture.exchangeInfo.optionSymbols);
  const contractsByUnderlying = new Map<string, string>();
  asArray<BinanceOptionContract>(fixture.exchangeInfo.optionContracts).forEach((contract) => {
    if (contract.underlying && contract.baseAsset) contractsByUnderlying.set(contract.underlying.toUpperCase(), contract.baseAsset.toUpperCase());
  });

  const activeSymbols = exchangeSymbols.filter((symbolInfo) => {
    const expiryDate = finiteNumber(symbolInfo.expiryDate);
    const activeStatus = !symbolInfo.status || symbolInfo.status.toUpperCase() === 'TRADING';
    return Boolean(symbolInfo.symbol && expiryDate && expiryDate > serverTime && activeStatus);
  });
  const markBySymbol = new Map(asArray<BinanceMark>(fixture.marks).filter((item) => item.symbol).map((item) => [item.symbol as string, item]));
  const tickerBySymbol = new Map(asArray<BinanceTicker>(fixture.tickers).filter((item) => item.symbol).map((item) => [item.symbol as string, item]));
  const oiBySymbol = new Map(asArray<BinanceOpenInterest>(fixture.openInterest).filter((item) => item.symbol).map((item) => [item.symbol as string, item]));
  const indexByUnderlying = new Map<string, number>();
  const indexTimestampByUnderlying = new Map<string, number>();
  (fixture.indices ?? []).forEach(({ requestedUnderlying, item }) => {
    const spot = positiveNumber(item.indexPrice);
    if (spot) indexByUnderlying.set(requestedUnderlying.toUpperCase(), spot);
    if (item.time) indexTimestampByUnderlying.set(requestedUnderlying.toUpperCase(), item.time);
  });

  const warnings: string[] = [];
  const quotes: OptionQuote[] = [];
  let skipped = 0;
  let estimatedIv = 0;
  let missingIv = 0;
  let missingBidAsk = 0;
  let missingBidOnly = 0;
  let missingAskOnly = 0;
  let missingBothSides = 0;
  let crossedBidAsk = 0;
  let missingOpenInterest = 0;
  let missingIndex = 0;
  const missingIndexAssets = new Set<string>();
  let missingUnit = 0;
  let missingRiskFreeRate = 0;

  for (const symbolInfo of activeSymbols) {
    const symbol = symbolInfo.symbol ?? '';
    const expiryDate = finiteNumber(symbolInfo.expiryDate);
    const strike = positiveNumber(symbolInfo.strikePrice);
    const type = normaliseSide(symbolInfo.side, symbol);
    const baseAsset = getBaseAsset(symbolInfo, contractsByUnderlying);
    const indexKey = (symbolInfo.underlying ?? `${baseAsset}USDT`).toUpperCase();
    const spot = indexByUnderlying.get(indexKey);
    if (!expiryDate || !strike || !type || !spot) {
      skipped += 1;
      if (!spot) {
        missingIndex += 1;
        missingIndexAssets.add(baseAsset);
      }
      continue;
    }

    const unit = positiveNumber(symbolInfo.unit);
    if (!unit) {
      missingUnit += 1;
      skipped += 1;
      continue;
    }
    const hasUnitOnePremiumParity = unit === 1;
    const daysToExpiry = Math.max(0, (expiryDate - serverTime) / 86_400_000);
    const mark = markBySymbol.get(symbol);
    const ticker = tickerBySymbol.get(symbol);
    const openInterest = oiBySymbol.get(symbol);
    const bid = positiveNumber(ticker?.bidPrice) ?? 0;
    const ask = positiveNumber(ticker?.askPrice) ?? 0;
    const observedMark = positiveNumber(mark?.markPrice);
    const lastPrice = positiveNumber(ticker?.lastPrice);
    const crossedQuote = bid > 0 && ask > 0 && ask < bid;
    const twoSidedMid = !crossedQuote && bid > 0 && ask > 0 ? (bid + ask) / 2 : undefined;
    const oneSidedQuote = !crossedQuote ? (bid > 0 ? bid : ask > 0 ? ask : undefined) : undefined;
    const observedPrice = observedMark ?? twoSidedMid ?? lastPrice ?? oneSidedQuote;
    const observedIv = positiveNumber(mark?.markIV);
    const bidIv = positiveNumber(mark?.bidIV);
    const askIv = positiveNumber(mark?.askIV);
    const sourceGreeks = {
      delta: finiteNumber(mark?.delta),
      gamma: finiteNumber(mark?.gamma),
      theta: finiteNumber(mark?.theta),
      vega: finiteNumber(mark?.vega),
    };
    const hasSourceGreeks = Object.values(sourceGreeks).some(Number.isFinite);
    const observedRiskFreeRate = finiteNumber(mark?.riskFreeInterest);
    const riskFreeRate = observedRiskFreeRate ?? 0;
    const referencePrice = twoSidedMid ?? observedMark ?? lastPrice ?? oneSidedQuote;
    const contractInfo = fixture.exchangeInfo.optionContracts?.find((contract) => contract.underlying?.toUpperCase() === indexKey);
    const contractType = (symbolInfo.contractType?.trim() || contractInfo?.contractType?.trim() || '').toUpperCase();
    const underlyingType = (symbolInfo.underlyingType?.trim() || contractInfo?.underlyingType?.trim() || '').toUpperCase();
    const hasExplicitUnderlyingType = underlyingType.length > 0;
    const hasExplicitContractType = contractType.length > 0;
    const isCommodity = underlyingType === 'COMMODITY';
    const isCrypto = underlyingType === 'CRYPTO'
      || (!hasExplicitUnderlyingType && contractType === 'CRYPTO_OPTIONS')
      || (!hasExplicitUnderlyingType && !hasExplicitContractType && ['BTC', 'ETH', 'BNB', 'XRP', 'DOGE', 'SOL'].includes(baseAsset));
    const underlyingKind = isCommodity ? 'PERPETUAL' as const : isCrypto ? 'SPOT' as const : 'UNKNOWN' as const;
    const exerciseStyle = isCommodity || isCrypto ? 'EUROPEAN' as const : 'UNKNOWN' as const;
    const settlementStyle = isCommodity || isCrypto ? 'CASH' as const : 'UNKNOWN' as const;
    const inferredAssetClass = inferAssetClass(baseAsset);
    const assetClass = isCrypto ? 'CRYPTO' : underlyingType === 'EQUITY' ? 'EQUITY'
      : isCommodity ? (inferredAssetClass === 'CRYPTO' ? 'UNKNOWN' : inferredAssetClass)
        : hasExplicitUnderlyingType || hasExplicitContractType ? 'UNKNOWN' : inferredAssetClass;
    const carryYield = isCrypto ? 0 : undefined;
    const contractEconomics = isCrypto && underlyingType === 'CRYPTO' && contractType === 'CRYPTO_OPTIONS'
      ? mapBinanceCryptoOptionEconomics({
        symbol,
        underlyingType,
        contractType,
        unit,
        quoteAsset: symbolInfo.quoteAsset ?? contractInfo?.quoteAsset ?? '',
        settleAsset: contractInfo?.settleAsset ?? '',
        serverTime,
      }) ?? undefined
      : undefined;
    const canonicalCashMultiplier = contractEconomics?.exercise.cashSettlement?.formula === 'INTRINSIC_VALUE'
      && contractEconomics.exercise.cashSettlement.reference === 'INDEX'
      && contractEconomics.premium.priceUnit === 'PER_CONTRACT'
      && contractEconomics.premium.multiplier === 1
      ? contractEconomics.exercise.cashSettlement.multiplier
      : undefined;
    // Model price/Greeks are calculated per underlying unit. Binance's
    // observed premium is per contract, so convert only through a verified
    // canonical cash multiplier (or the narrow legacy unit=1 parity case).
    const modelPriceScale = canonicalCashMultiplier ?? (hasUnitOnePremiumParity ? 1 : undefined);
    const pricingInputs = {
      underlyingKind,
      exerciseStyle,
      settlementStyle,
      spot,
      strike,
      daysToExpiry,
      type,
      rate: riskFreeRate,
      carryYield,
    };
    const calculatedIv = observedIv ?? (isCrypto && modelPriceScale !== undefined && referencePrice !== undefined
      ? impliedVolatilityForContract(referencePrice / modelPriceScale, pricingInputs)
      : undefined);
    const ivStatus = observedIv !== undefined ? 'OBSERVED' as const
      : calculatedIv !== undefined ? 'ESTIMATED' as const : 'UNAVAILABLE' as const;
    const iv = calculatedIv ?? 0;

    const pricingResult = iv > 0 && isCrypto && modelPriceScale !== undefined
      ? priceOption({ ...pricingInputs, volatility: iv })
      : { status: 'UNSUPPORTED' as const, reason: ivStatus === 'UNAVAILABLE'
        ? 'Implied volatility is unavailable from the source and no supported model can derive it from this contract.'
        : isCrypto && modelPriceScale === undefined
          ? 'Binance unit is underlying quantity per contract; verified canonical cash-settlement terms are required to normalize per-contract premium and model price.'
          : isCommodity
            ? 'Underlying is the Binance TradFi Perpetual Contract Index; no validated spot or futures pricing model is applied.'
            : 'Underlying type and contract mechanics are not validated for analytical pricing.' };
    const modelGreeks = pricingResult.status === 'SUPPORTED' ? pricingResult.greeks : undefined;
    const priceSource = observedMark ? 'MARK' : twoSidedMid ? 'MID' : lastPrice ? 'LAST' : bid > 0 && !crossedQuote ? 'BID' : ask > 0 && !crossedQuote ? 'ASK' : 'MODEL';
    const markPrice = observedPrice ?? (modelPriceScale !== undefined && modelGreeks ? modelGreeks.price * modelPriceScale : undefined);
    if (markPrice === undefined || markPrice <= 0) {
      skipped += 1;
      continue;
    }
    const estimatedFields: string[] = [];
    if (ivStatus === 'ESTIMATED') {
      estimatedIv += 1;
      estimatedFields.push('iv');
    } else if (ivStatus === 'UNAVAILABLE') {
      missingIv += 1;
    }
    if (priceSource === 'MODEL') estimatedFields.push('markPrice');
    if (!bid || !ask) {
      missingBidAsk += 1;
      if (!bid && !ask) missingBothSides += 1;
      else if (!bid) missingBidOnly += 1;
      else missingAskOnly += 1;
    }
    if (crossedQuote) crossedBidAsk += 1;
    if (!openInterest) missingOpenInterest += 1;
    if (observedRiskFreeRate === undefined) {
      missingRiskFreeRate += 1;
      estimatedFields.push('riskFreeRate');
    }
    if (!modelGreeks) estimatedFields.push('delta', 'gamma', 'theta', 'vega', 'rho');

    const expiry = new Date(expiryDate).toISOString();
    const tickerTimestamp = finiteNumber(ticker?.closeTime);
    const indexTimestamp = indexTimestampByUnderlying.get(indexKey);
    const openInterestTimestamp = finiteNumber(openInterest?.timestamp);
    const sourceTimestamps = {
      ...(tickerTimestamp !== undefined && tickerTimestamp > 0 ? { ticker: new Date(tickerTimestamp).toISOString() } : {}),
      ...(indexTimestamp !== undefined && indexTimestamp > 0 ? { index: new Date(indexTimestamp).toISOString() } : {}),
      ...(openInterestTimestamp !== undefined && openInterestTimestamp > 0 ? { openInterest: new Date(openInterestTimestamp).toISOString() } : {}),
    };
    // /eapi/v1/mark publishes markIV and riskFreeInterest without event timestamps.
    // Record the local receive/availability time separately; never fabricate an exchange event time.
    const markSnapshotReceivedAt = Number.isFinite(fixture.fetchedAt) && fixture.fetchedAt > 0
      ? new Date(fixture.fetchedAt).toISOString()
      : undefined;
    const sourceReceivedAt = {
      ...(observedIv !== undefined && markSnapshotReceivedAt ? { markIv: markSnapshotReceivedAt } : {}),
      ...(observedRiskFreeRate !== undefined && markSnapshotReceivedAt ? { riskFreeRate: markSnapshotReceivedAt } : {}),
    };
    const filters = Array.isArray(symbolInfo.filters) ? symbolInfo.filters : undefined;
    const lotSizeFilter = filters?.find((filter) => ['LOT_SIZE', 'MARKET_LOT_SIZE'].includes(filter.filterType.toUpperCase()));
    const minQty = positiveNumber(symbolInfo.minQty) ?? positiveNumber(lotSizeFilter?.minQty);
    const maxQty = positiveNumber(symbolInfo.maxQty) ?? positiveNumber(lotSizeFilter?.maxQty);
    quotes.push({
      id: symbol,
      symbol,
      underlying: baseAsset,
      assetClass,
      venue: 'BINANCE',
      underlyingKind,
      exerciseStyle: exerciseStyle === 'UNKNOWN' ? undefined : exerciseStyle,
      settlementStyle: settlementStyle === 'UNKNOWN' ? undefined : settlementStyle,
      quoteAsset: symbolInfo.quoteAsset ?? contractInfo?.quoteAsset,
      settlementAsset: contractInfo?.settleAsset,
      contractEconomics,
      // Binance publishes `unit` (underlying quantity per contract), not a separate contractMultiplier.
      carryYield,
      riskFreeRate,
      ...(observedRiskFreeRate !== undefined ? { riskFreeRateSource: 'REST_MARK' as const } : {}),
      ...(observedIv !== undefined ? { markIvSource: 'REST_MARK' as const } : {}),
      sourceReceivedAt,
      pricingStatus: modelGreeks ? 'ASSUMED' : 'OBSERVED_ONLY',
      pricingModel: pricingResult.status === 'SUPPORTED' ? pricingResult.model : undefined,
      pricingReason: pricingResult.status === 'SUPPORTED' ? 'Crypto carry yield is assumed to be 0%; confirm this approximation against the venue index and funding/carry mechanics.' : pricingResult.reason,
      expiry,
      daysToExpiry,
      strike,
      type,
      bid,
      ask,
      markPrice,
      priceSource,
      iv,
      ivStatus,
      forward: undefined,
      bidIv,
      askIv,
      unverifiedSourceGreeks: hasSourceGreeks ? sourceGreeks : undefined,
      delta: modelGreeks?.delta ?? 0,
      gamma: modelGreeks?.gamma ?? 0,
      theta: modelGreeks?.thetaPerDay ?? 0,
      vega: modelGreeks?.vegaPerVolPoint ?? 0,
      rho: modelGreeks?.rhoPerRatePoint ?? 0,
      openInterest: finiteNumber(openInterest?.sumOpenInterest) ?? null,
      openInterestUsd: finiteNumber(openInterest?.sumOpenInterestUsd) ?? null,
      volume: finiteNumber(ticker?.volume) ?? null,
      volumeQuote: finiteNumber(ticker?.amount) ?? null,
      spot,
      unit,
      contractStatus: symbolInfo.status ?? 'TRADING',
      minQty,
      maxQty,
      makerFeeRate: finiteNumber(symbolInfo.makerFeeRate),
      takerFeeRate: finiteNumber(symbolInfo.takerFeeRate),
      priceScale: finiteNumber(symbolInfo.priceScale),
      quantityScale: finiteNumber(symbolInfo.quantityScale),
      filters,
      sourceTimestamp: sourceTimestamps.ticker,
      sourceTimestamps,
      estimatedFields,
    });
  }

  const availableAssets = [...new Set(quotes.map((quote) => quote.underlying))].sort((a, b) => a.localeCompare(b));
  if (skipped > 0) warnings.push(`تعذّر استكمال بيانات ${skipped} عقد من قائمة Binance؛ قد يكون مؤشر الأصل أو سعر العقد غير متاح.`);
  if (missingIndex > 0) warnings.push(`لم تتوفر أسعار مؤشر Binance لـ${missingIndex} عقد؛ الأصول المتأثرة: ${[...missingIndexAssets].sort().join('، ')}. لم تُستعر أسعار Demo بديلاً عنها.`);
  if (estimatedIv > 0) warnings.push(`استُنتج IV بنموذج Black–Scholes لـ${estimatedIv} عقد غاب فيها markIV؛ هذه قيم نموذجية وليست مرصودة.`);
  if (missingIv > 0) warnings.push(`IV غير متاح لـ${missingIv} عقد؛ أبقينا العقود التي لديها سعر سوق صالح ظاهرة، وحجبنا تحليل IV والنموذج بدلاً من حذفها أو اختلاق قيمة.`);
  if (missingBidAsk > 0) warnings.push(`Bid أو Ask غير متاح لـ${missingBidAsk} عقد (Bid مفقود فقط: ${missingBidOnly}، Ask مفقود فقط: ${missingAskOnly}، كلاهما مفقود: ${missingBothSides})؛ لم يُختلق الطرف الناقص والفارق غير متاح.`);
  if (crossedBidAsk > 0) warnings.push(`تعارض Bid/Ask في ${crossedBidAsk} عقد؛ استُبعد المنتصف من مرجع السعر.`);
  if (missingOpenInterest > 0) warnings.push(`الفائدة المفتوحة غير متاحة لـ${missingOpenInterest} عقد/استحقاق.`);
  if (missingUnit > 0) warnings.push(`وحدة العقد غير موجودة في ${missingUnit} عقد؛ استُبعدت هذه العقود بدلاً من افتراض مضاعف 1.`);
  const unverifiedPremiumScale = quotes.filter((quote) => {
    const cash = quote.contractEconomics?.exercise.cashSettlement;
    const verifiedCanonicalScale = quote.contractEconomics?.provenance.status === 'PROVIDER_VERIFIED'
      && quote.contractEconomics.premium.priceUnit === 'PER_CONTRACT'
      && quote.contractEconomics.premium.multiplier === 1
      && cash?.formula === 'INTRINSIC_VALUE'
      && cash.reference === 'INDEX'
      && cash.multiplier === quote.unit;
    return quote.assetClass === 'CRYPTO' && quote.unit > 1 && !verifiedCanonicalScale;
  }).length;
  if (unverifiedPremiumScale > 0) warnings.push(`مقياس القسط غير مفصول عن وحدة التسليم في ${unverifiedPremiumScale} عقد Binance ذات unit أكبر من 1؛ أبقينا الأسعار وIV المرصودة فقط وحجبنا القيم النموذجية وحسابات P&L لكل عقد.`);
  if (missingRiskFreeRate > 0) warnings.push(`معدل الفائدة من Binance غير متاح لـ${missingRiskFreeRate} عقد؛ استُخدم 0% للنموذج.`);
  if (quotes.length) warnings.push('Gamma وTheta وVega وRho تقديرات Black–Scholes وليست Greeks مرصودة من Binance؛ تحقّق من الوحدات قبل استخدامها.');
  if (!quotes.length) {
    const missingAssets = [...missingIndexAssets].sort();
    const detail = missingAssets.length
      ? ` تعذّر تحميل مؤشر الأصل للرموز: ${missingAssets.join('، ')}.`
      : ' قد تكون بيانات المؤشر أو السعر أو التقلب غير متاحة حالياً.';
    throw new Error(`لم تُرجع Binance بيانات كافية لتحليل عقود نشطة.${detail}`);
  }

  return { quotes, fetchedAt, serverTime, availableAssets, activeSymbols: activeSymbols.length, warnings };
}

export function normalizeBinanceDepth(
  payload: BinanceDepthResponse,
  symbol: string,
  fetchedAt = Date.now(),
): BinanceDepthSnapshot {
  const normalizeLevels = (levels: BinanceDepthResponse['bids']) => (levels ?? [])
    .filter((level): level is [string | number, string | number] => Array.isArray(level) && level.length >= 2)
    .map(([rawPrice, rawQuantity]) => ({ price: finiteNumber(rawPrice), quantity: finiteNumber(rawQuantity) }))
    .filter((level): level is BinanceDepthLevel => level.price !== undefined && level.price > 0
      && level.quantity !== undefined && level.quantity > 0)
    .sort((a, b) => b.price - a.price);

  return {
    symbol,
    lastUpdateId: finiteNumber(payload.lastUpdateId),
    transactionTime: finiteNumber(payload.T),
    fetchedAt,
    bids: normalizeLevels(payload.bids),
    asks: normalizeLevels(payload.asks).sort((a, b) => a.price - b.price),
  };
}

async function getJson<T>(
  path: string,
  params?: Record<string, string>,
  proxyUrl?: string,
  externalSignal?: AbortSignal,
): Promise<T> {
  let url: URL;
  if (proxyUrl) {
    const endpoint = path.match(/^\/eapi\/v1\/([a-zA-Z]+)$/)?.[1];
    if (!endpoint) throw new Error('Unsupported Binance market-data endpoint.');
    url = new URL(proxyUrl);
    url.searchParams.set('endpoint', endpoint);
  } else {
    url = new URL(`${BINANCE_OPTIONS_API}${path}`);
  }
  Object.entries(params ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
    let payload: unknown;
    try {
      payload = await response.json() as unknown;
    } catch {
      throw new Error(`Binance market-data service returned HTTP ${response.status} with a non-JSON response.`);
    }
    if (!response.ok) {
      const error = payload && typeof payload === 'object' ? payload as { msg?: string; error?: string } : {};
      const detail = error.msg ?? error.error;
      throw new BinanceMarketDataError(response.status, detail);
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'code' in payload) {
      const error = payload as { code?: number; msg?: string; optionSymbols?: unknown };
      if ((error.code !== undefined && error.code !== 0) || (error.msg && !error.optionSymbols)) {
        throw new Error(error.msg || `Binance API error ${error.code}`);
      }
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function fetchBinanceDepth(
  symbol: string,
  proxyUrl?: string,
  signal?: AbortSignal,
): Promise<BinanceDepthSnapshot> {
  if (!/^[A-Z0-9]{2,16}-\d{6}-\d+(?:\.\d+)?-[CP]$/.test(symbol)) {
    throw new Error('Invalid Binance option symbol for order-book depth.');
  }
  const payload = await getJson<BinanceDepthResponse>(
    '/eapi/v1/depth',
    { symbol, limit: '20' },
    proxyUrl,
    signal,
  );
  return normalizeBinanceDepth(payload, symbol, Date.now());
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchBinanceOptions(proxyUrl?: string): Promise<BinanceOptionsSnapshot> {
  const exchangeInfo = await getJson<BinanceExchangeInfo>('/eapi/v1/exchangeInfo', undefined, proxyUrl);
  const serverTime = finiteNumber(exchangeInfo.serverTime) ?? Date.now();
  const symbols = asArray<BinanceOptionSymbol>(exchangeInfo.optionSymbols).filter((item) => {
    const expiry = finiteNumber(item.expiryDate);
    return Boolean(item.symbol && expiry && expiry > serverTime && (!item.status || item.status.toUpperCase() === 'TRADING'));
  });
  if (!symbols.length) throw new Error('لم تُرجع معلومات Binance أي عقود خيارات نشطة.');

  const contractsByUnderlying = new Map<string, string>();
  asArray<BinanceOptionContract>(exchangeInfo.optionContracts).forEach((contract) => {
    if (contract.underlying && contract.baseAsset) contractsByUnderlying.set(contract.underlying.toUpperCase(), contract.baseAsset.toUpperCase());
  });
  const underlyingSymbols = [...new Set(asArray<BinanceOptionContract>(exchangeInfo.optionContracts)
    .map((contract) => contract.underlying?.toUpperCase())
    .filter((value): value is string => Boolean(value)))];
  if (!underlyingSymbols.length) {
    symbols.forEach((item) => { if (item.underlying) underlyingSymbols.push(item.underlying.toUpperCase()); });
  }

  const [marksResult, tickersResult, indexResults] = await Promise.allSettled([
    getJson<BinanceMark[]>('/eapi/v1/mark', undefined, proxyUrl),
    getJson<BinanceTicker[]>('/eapi/v1/ticker', undefined, proxyUrl),
    mapWithConcurrency(underlyingSymbols, 4, async (underlying) => {
      try {
        const response = await getJson<BinanceIndex[] | BinanceIndex>('/eapi/v1/index', { underlying }, proxyUrl);
        const item = Array.isArray(response) ? response[0] : response;
        return item ? { requestedUnderlying: underlying, item } : null;
      } catch {
        return null;
      }
    }),
  ]);

  const warnings: string[] = [];
  const marks = marksResult.status === 'fulfilled' ? asArray<BinanceMark>(marksResult.value) : [];
  const tickers = tickersResult.status === 'fulfilled' ? asArray<BinanceTicker>(tickersResult.value) : [];
  if (marksResult.status === 'rejected') warnings.push('تعذّر تحميل mark price/IV من Binance؛ ستُستخدم فقط الأسعار التي تسمح باستنتاجها.');
  if (tickersResult.status === 'rejected') warnings.push('تعذّر تحميل بيانات 24 ساعة وBid/Ask من Binance.');

  const indexValues = indexResults.status === 'fulfilled' ? indexResults.value.filter((value): value is NonNullable<typeof value> => value !== null) : [];
  if (indexValues.length < underlyingSymbols.length) warnings.push(`نجح تحميل المؤشر لـ${indexValues.length} من ${underlyingSymbols.length} أصول أساسية.`);

  const groups = calculateOpenInterestGroups(symbols, contractsByUnderlying);
  const openInterestResults = await mapWithConcurrency(groups, 4, async ({ baseAsset, expiry }) => {
    try {
      const response = await getJson<BinanceOpenInterest[] | BinanceOpenInterest>('/eapi/v1/openInterest', { underlyingAsset: baseAsset, expiration: expiry }, proxyUrl);
      return Array.isArray(response) ? response : response && typeof response === 'object' ? [response] : [];
    } catch {
      return [];
    }
  });
  const openInterest = openInterestResults.flat();
  if (groups.length && openInterest.length === 0) warnings.push('لم تُرجع خدمة الفائدة المفتوحة بيانات؛ سيظل هذا الحقل غير متاح.');

  const fixture: BinanceFixture = {
    exchangeInfo,
    marks,
    tickers,
    indices: indexValues,
    openInterest,
    fetchedAt: Date.now(),
  };
  const snapshot = normalizeBinanceSnapshot(fixture);
  return { ...snapshot, warnings: [...warnings, ...snapshot.warnings] };
}
