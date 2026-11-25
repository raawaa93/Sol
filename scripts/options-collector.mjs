import { canonicalJson, createOptionsArchiveRecord, sha256 } from './options-archive.mjs';

const REST_ENDPOINTS = Object.freeze({
  exchangeInfo: { path: '/eapi/v1/exchangeInfo', required: [], optional: [] },
  klines: { path: '/eapi/v1/klines', required: ['symbol', 'interval'], optional: ['startTime', 'endTime', 'limit'] },
  recentTrades: { path: '/eapi/v1/trades', required: ['symbol'], optional: ['limit'] },
  blockTrades: { path: '/eapi/v1/blockTrades', required: [], optional: ['symbol', 'limit'] },
  depth: { path: '/eapi/v1/depth', required: ['symbol'], optional: ['limit'] },
  ticker: { path: '/eapi/v1/ticker', required: [], optional: ['symbol'] },
  mark: { path: '/eapi/v1/mark', required: [], optional: ['symbol'] },
  index: { path: '/eapi/v1/index', required: ['underlying'], optional: [] },
  openInterest: { path: '/eapi/v1/openInterest', required: ['underlyingAsset', 'expiration'], optional: [] },
});

const REST_ENDPOINT_ID = Object.freeze({
  exchangeInfo: 'REST_EXCHANGE_INFO',
  klines: 'REST_KLINES',
  recentTrades: 'REST_RECENT_TRADES',
  blockTrades: 'REST_BLOCK_TRADES',
  depth: 'REST_DEPTH',
  ticker: 'REST_TICKER',
  mark: 'REST_MARK',
  index: 'REST_INDEX',
  openInterest: 'REST_OPEN_INTEREST',
});

export class OptionsCollectorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OptionsCollectorError';
    this.code = code;
  }
}

function validSymbol(value) { return typeof value === 'string' && /^[A-Z0-9-]{2,64}$/.test(value); }
function validPositiveInteger(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0; }
function iso(milliseconds) {
  const value = Number(milliseconds);
  return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
}
function numeric(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function observedField(name, value, unit, sourcePath, eventAt, receivedAt, availableAt = receivedAt, staleAfterMs = 5_000) {
  if (value === undefined || value === null) return null;
  return {
    name, value, unit, provenance: 'OBSERVED', sourcePath,
    exchangeEventAt: eventAt, receivedAt, availableAt, staleAfterMs,
  };
}

export function buildPublicBinanceRestUrl(endpoint, params = {}) {
  const definition = REST_ENDPOINTS[endpoint];
  if (!definition) throw new OptionsCollectorError('ENDPOINT_NOT_ALLOWED', 'Only the public Binance Options REST allowlist is supported.');
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new OptionsCollectorError('INVALID_PARAMS', 'Endpoint parameters must be an object.');
  const allowed = new Set([...definition.required, ...definition.optional]);
  for (const key of Object.keys(params)) {
    if (!allowed.has(key)) throw new OptionsCollectorError('PARAM_NOT_ALLOWED', `Parameter ${key} is not allowed for this endpoint.`);
  }
  for (const key of definition.required) {
    if (params[key] === undefined || params[key] === null || params[key] === '') throw new OptionsCollectorError('PARAM_REQUIRED', `Parameter ${key} is required.`);
  }
  if (params.symbol !== undefined && !validSymbol(params.symbol)) throw new OptionsCollectorError('INVALID_SYMBOL', 'Invalid Binance Options symbol.');
  if (params.underlying !== undefined && !/^[A-Z0-9]{3,16}$/.test(params.underlying)) throw new OptionsCollectorError('INVALID_UNDERLYING', 'Invalid underlying.');
  if (params.underlyingAsset !== undefined && !/^[A-Z0-9]{2,10}(\/[A-Z0-9]{2,10})?$/.test(params.underlyingAsset)) throw new OptionsCollectorError('INVALID_UNDERLYING', 'Invalid underlying asset.');
  if (params.expiration !== undefined && !/^\d{6}$/.test(String(params.expiration))) throw new OptionsCollectorError('INVALID_EXPIRATION', 'Expiration must be YYMMDD.');
  if (params.interval !== undefined && !/^(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|1M)$/.test(params.interval)) throw new OptionsCollectorError('INVALID_INTERVAL', 'Unsupported kline interval.');
  for (const key of ['startTime', 'endTime', 'limit']) {
    if (params[key] !== undefined && !validPositiveInteger(params[key])) throw new OptionsCollectorError('INVALID_NUMERIC_PARAM', `${key} must be a positive integer.`);
  }
  const maxLimit = endpoint === 'klines' ? 1500 : ['recentTrades', 'blockTrades'].includes(endpoint) ? 500 : 1000;
  if (params.limit !== undefined && Number(params.limit) > maxLimit) throw new OptionsCollectorError('LIMIT_TOO_LARGE', 'REST limit exceeds the published endpoint maximum.');
  if (endpoint === 'depth' && params.limit !== undefined && ![10, 20, 50, 100, 500, 1000].includes(Number(params.limit))) {
    throw new OptionsCollectorError('INVALID_DEPTH_LIMIT', 'Depth limit must be one of Binance published levels: 10, 20, 50, 100, 500 or 1000.');
  }
  const url = new URL(definition.path, 'https://eapi.binance.com');
  for (const key of [...definition.required, ...definition.optional]) {
    if (params[key] !== undefined) url.searchParams.set(key, String(params[key]));
  }
  return url;
}

export async function requestPublicBinanceRest(endpoint, params, transport) {
  if (!transport || typeof transport.fetch !== 'function') throw new OptionsCollectorError('TRANSPORT_REQUIRED', 'An injected public-data transport is required.');
  const url = buildPublicBinanceRestUrl(endpoint, params);
  const response = await transport.fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 451 || response.status === 403) {
    throw new OptionsCollectorError('ELIGIBILITY_BLOCKED', `Binance returned HTTP ${response.status}; collection must stop without changing egress or region.`);
  }
  if (!response.ok) throw new OptionsCollectorError('UPSTREAM_HTTP', `Binance public endpoint returned HTTP ${response.status}.`);
  return response.json();
}

function makeRecord({ kind, endpoint, symbol, rawPayload, eventAt, receivedAt, availableAt = receivedAt, fields, id, quality = 'VALID', flags = [], historicalBackfill = false, contractSpec = null, contractSpecObservedAt, contractSpecAvailableAt }) {
  const normalizedSymbol = typeof symbol === 'string' && symbol ? symbol.toUpperCase() : 'UNKNOWN';
  const key = id ?? sha256(typeof rawPayload === 'string' ? rawPayload : canonicalJson(rawPayload));
  return createOptionsArchiveRecord({
    kind,
    endpoint,
    symbol: normalizedSymbol,
    idempotencyKey: `${kind}|${normalizedSymbol}|${key}`,
    rawPayload,
    clocks: {
      exchangeEventAt: eventAt,
      receivedAt,
      availableAt,
    },
    contractSpec,
    ...(contractSpec ? { contractSpecObservedAt, contractSpecAvailableAt } : {}),
    fields: fields.filter(Boolean),
    quality: { status: quality, flags },
    historicalBackfill,
  });
}

export function mapVerifiedBinanceContractSpec(exchangeInfo, symbol, receivedAt) {
  const payload = unwrap(exchangeInfo);
  const serverTime = numeric(payload.serverTime);
  const receivedMs = Date.parse(receivedAt);
  if (!validSymbol(symbol) || serverTime === null || serverTime <= 0 || !Number.isFinite(receivedMs)
    || receivedMs < serverTime || receivedMs - serverTime > 5 * 60 * 1000) return null;
  const symbolMatches = Array.isArray(payload.optionSymbols)
    ? payload.optionSymbols.filter((item) => item?.symbol?.toUpperCase() === symbol)
    : [];
  if (symbolMatches.length !== 1) return null;
  const symbolInfo = symbolMatches[0];
  const underlying = typeof symbolInfo.underlying === 'string' ? symbolInfo.underlying.toUpperCase() : '';
  const baseAsset = symbol.split('-')[0];
  if (!underlying) return null;
  const contractMatches = Array.isArray(payload.optionContracts)
    ? payload.optionContracts.filter((item) => item?.underlying?.toUpperCase() === underlying)
    : [];
  if (contractMatches.length !== 1) return null;
  const contractInfo = contractMatches[0];
  if (!contractInfo
    || String(symbolInfo.underlyingType ?? '').toUpperCase() !== 'CRYPTO'
    || String(symbolInfo.contractType ?? '').toUpperCase() !== 'CRYPTO_OPTIONS') return null;
  const side = String(symbolInfo.side ?? '').toUpperCase();
  const optionType = side === 'CALL' || side === 'C' ? 'CALL' : side === 'PUT' || side === 'P' ? 'PUT' : '';
  const strike = numeric(symbolInfo.strikePrice);
  const expiry = numeric(symbolInfo.expiryDate);
  const unit = numeric(symbolInfo.unit);
  const quoteAsset = String(symbolInfo.quoteAsset ?? '').toUpperCase();
  const contractQuoteAsset = String(contractInfo.quoteAsset ?? '').toUpperCase();
  const settlementAsset = String(contractInfo.settleAsset ?? '').toUpperCase();
  if (!['CALL', 'PUT'].includes(optionType) || strike === null || strike <= 0
    || expiry === null || !Number.isSafeInteger(expiry) || expiry <= serverTime
    || unit === null || !Number.isSafeInteger(unit) || unit <= 0
    || !/^[A-Z][A-Z0-9]{1,11}$/.test(quoteAsset)
    || !/^[A-Z][A-Z0-9]{1,11}$/.test(contractQuoteAsset)
    || !/^[A-Z][A-Z0-9]{1,11}$/.test(settlementAsset)
    || quoteAsset !== contractQuoteAsset || quoteAsset !== settlementAsset
    || String(symbolInfo.status ?? '').toUpperCase() !== 'TRADING'
    || !contractInfo.baseAsset || contractInfo.baseAsset.toUpperCase() !== baseAsset) return null;
  const contractSpec = {
    symbol,
    underlying: underlying || baseAsset,
    optionType,
    strike,
    expiryAt: new Date(expiry).toISOString(),
    unit,
    premiumUnit: 'PER_CONTRACT',
    premiumMultiplier: 1,
    quoteAsset,
    settlementAsset,
    exerciseStyle: 'EUROPEAN',
    settlementStyle: 'CASH',
    cashSettlementMultiplier: unit,
    settlementPriceMethod: 'INDEX_ARITHMETIC_MEAN',
    settlementWindowMs: 30 * 60 * 1000,
    sourceEndpoint: 'REST_EXCHANGE_INFO',
    termsSource: 'BINANCE_OPTIONS_CONTRACT_SPECIFICATIONS_2026-01-05',
    settlementTermsSource: 'BINANCE_CLEARING_PROCEDURES_126_130',
    version: sha256(canonicalJson({
      symbolInfo,
      contractInfo,
      termsSource: 'BINANCE_OPTIONS_CONTRACT_SPECIFICATIONS_2026-01-05',
      settlementTermsSource: 'BINANCE_CLEARING_PROCEDURES_126_130',
    })),
  };
  return {
    contractSpec,
    contractSpecObservedAt: new Date(serverTime).toISOString(),
    contractSpecAvailableAt: new Date(Date.parse(receivedAt)).toISOString(),
  };
}

function attachContractSpec(record, state) {
  const spec = state.contractSpecs?.get(record.symbol);
  if (!spec) return record;
  const receivedAt = Date.parse(record.clocks.receivedAt);
  const specAvailableAt = Date.parse(spec.contractSpecAvailableAt);
  if (!Number.isFinite(receivedAt) || !Number.isFinite(specAvailableAt)
    || receivedAt < specAvailableAt || receivedAt - specAvailableAt > 5 * 60 * 1000) return record;
  return createOptionsArchiveRecord({
    ...record,
    contractSpec: spec.contractSpec,
    contractSpecObservedAt: spec.contractSpecObservedAt,
    contractSpecAvailableAt: spec.contractSpecAvailableAt,
  });
}

function parseExchangeInfo(rawPayload, receivedAt, state) {
  const payload = unwrap(rawPayload);
  const serverTime = numeric(payload.serverTime);
  const eventAt = iso(serverTime);
  const symbols = Array.isArray(payload.optionSymbols) ? payload.optionSymbols : [];
  const contracts = Array.isArray(payload.optionContracts) ? payload.optionContracts : [];
  // exchangeInfo is a full snapshot: remove terms for symbols no longer eligible before applying it.
  state.contractSpecs.clear();
  let mapped = 0;
  for (const symbolInfo of symbols) {
    const symbol = typeof symbolInfo?.symbol === 'string' ? symbolInfo.symbol.toUpperCase() : '';
    const spec = mapVerifiedBinanceContractSpec(payload, symbol, receivedAt);
    if (spec) {
      state.contractSpecs.set(symbol, spec);
      mapped += 1;
    }
  }
  const quality = eventAt && Date.parse(receivedAt) >= Date.parse(eventAt) ? 'VALID' : 'DEGRADED';
  const record = createOptionsArchiveRecord({
    kind: 'EXCHANGE_INFO',
    endpoint: 'REST_EXCHANGE_INFO',
    symbol: 'BINANCE-OPTIONS',
    idempotencyKey: `exchangeInfo:${serverTime ?? 'unknown'}:${sha256(canonicalJson(payload))}`,
    rawPayload,
    clocks: { exchangeEventAt: eventAt, receivedAt, availableAt: receivedAt },
    contractSpec: null,
    fields: [
      observedField('serverTime', serverTime, 'UNIX_MILLISECONDS', 'serverTime', eventAt, receivedAt, receivedAt, null),
      observedField('optionSymbolCount', symbols.length, 'COUNT', 'optionSymbols.length', eventAt, receivedAt, receivedAt, null),
      observedField('optionContractCount', contracts.length, 'COUNT', 'optionContracts.length', eventAt, receivedAt, receivedAt, null),
      observedField('mappedCryptoOptionSpecs', mapped, 'COUNT', 'optionSymbols+optionContracts', eventAt, receivedAt, receivedAt, null),
    ],
    quality: { status: quality, flags: quality === 'VALID' ? [] : ['EXCHANGE_INFO_TIME_INVALID'] },
    historicalBackfill: false,
  });
  return [record];
}

function unwrap(rawPayload) {
  let parsed = rawPayload;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { throw new OptionsCollectorError('INVALID_JSON', 'Stream message is not valid JSON.'); }
  }
  if (!parsed || typeof parsed !== 'object') throw new OptionsCollectorError('INVALID_EVENT', 'Stream event must be a JSON object.');
  return parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
}

function parseBookTicker(event, rawPayload, receivedAt) {
  const symbol = event.s;
  const eventAt = iso(event.E);
  const bid = numeric(event.b);
  const ask = numeric(event.a);
  const bidSize = numeric(event.B);
  const askSize = numeric(event.A);
  const crossed = bid !== null && ask !== null && bid > ask;
  const invalidPrice = bid !== null && bid <= 0 || ask !== null && ask <= 0;
  const invalidSize = bidSize !== null && bidSize < 0 || askSize !== null && askSize < 0;
  const fields = [
    observedField('bid', bid, 'VENUE_REPORTED_PRICE_UNIT', 'b', eventAt, receivedAt),
    observedField('ask', ask, 'VENUE_REPORTED_PRICE_UNIT', 'a', eventAt, receivedAt),
    observedField('bidSize', bidSize, 'VENUE_REPORTED_SIZE_UNIT', 'B', eventAt, receivedAt),
    observedField('askSize', askSize, 'VENUE_REPORTED_SIZE_UNIT', 'A', eventAt, receivedAt),
    observedField('updateId', numeric(event.u), 'UPDATE_ID', 'u', eventAt, receivedAt),
    observedField('transactionTime', numeric(event.T), 'UNIX_MILLISECONDS', 'T', iso(event.T), receivedAt),
  ];
  return makeRecord({
    kind: 'BOOK_TICKER', endpoint: 'WS_BOOK_TICKER', symbol, rawPayload, eventAt, receivedAt, fields,
    id: validPositiveInteger(event.u) ? `update:${event.u}` : undefined,
    quality: crossed || invalidPrice || invalidSize ? 'INVALID' : (!eventAt || bid === null || ask === null ? 'DEGRADED' : 'VALID'),
    flags: [
      ...(crossed ? ['CROSSED_BOOK'] : []),
      ...(invalidPrice ? ['INVALID_BBO_PRICE'] : []),
      ...(invalidSize ? ['INVALID_BBO_SIZE'] : []),
      ...(bid === null || ask === null ? ['INCOMPLETE_BBO'] : []),
      ...(!eventAt ? ['EVENT_TIME_MISSING'] : []),
    ],
  });
}

function parseTrade(event, rawPayload, receivedAt) {
  if (event.X !== 'MARKET' && event.X !== 'BLOCK') {
    return makeRecord({ kind: 'GAP', endpoint: 'WS_OPTION_TRADE', symbol: event.s, rawPayload,
      eventAt: iso(event.E), receivedAt, fields: [], quality: 'INVALID', flags: ['UNKNOWN_TRADE_TYPE'],
      id: event.t !== undefined ? `unknown-trade:${event.t}` : undefined });
  }
  const tradeKind = event.X === 'BLOCK' ? 'TRADE_BLOCK' : 'TRADE_MARKET';
  const eventAt = iso(event.E);
  const transactionAt = iso(event.T);
  const maker = typeof event.m === 'boolean' ? event.m : null;
  const aggressor = maker === null ? null : maker ? 'SELL' : 'BUY';
  const fields = [
    observedField('price', numeric(event.p), 'VENUE_REPORTED_PRICE_UNIT', 'p', eventAt, receivedAt),
    observedField('quantity', numeric(event.q), 'VENUE_REPORTED_SIZE_UNIT', 'q', eventAt, receivedAt),
    observedField('tradeId', numeric(event.t), 'TRADE_ID', 't', eventAt, receivedAt, receivedAt, null),
    observedField('tradeTime', numeric(event.T), 'UNIX_MILLISECONDS', 'T', transactionAt, receivedAt, receivedAt, null),
    observedField('makerSide', maker, 'BOOLEAN', 'm', eventAt, receivedAt, receivedAt, null),
    observedField('aggressorSide', aggressor, 'BUY_OR_SELL', 'm', eventAt, receivedAt, receivedAt, null),
    observedField('reportedDirection', event.S, 'BUY_OR_SELL', 'S', eventAt, receivedAt, receivedAt, null),
    observedField('tradeType', event.X, 'MARKET_OR_BLOCK', 'X', eventAt, receivedAt, receivedAt, null),
  ];
  const tradePrice = numeric(event.p);
  const tradeQuantity = numeric(event.q);
  const quality = !eventAt || !transactionAt || maker === null || tradePrice === null || tradePrice <= 0 || tradeQuantity === null || tradeQuantity <= 0
    ? 'DEGRADED' : 'VALID';
  return makeRecord({
    kind: tradeKind, endpoint: 'WS_OPTION_TRADE', symbol: event.s, rawPayload, eventAt, receivedAt, fields,
    id: validPositiveInteger(event.t) ? `trade:${event.t}` : undefined,
    quality,
    flags: quality === 'VALID' ? [] : ['TRADE_FIELDS_OR_TIMESTAMPS_INCOMPLETE'],
  });
}

function parseKline(event, rawPayload, receivedAt) {
  const candle = event.k;
  if (!candle || candle.x !== true) return null;
  const closeAt = iso(candle.T);
  const eventAt = iso(event.E);
  const receivedMs = Date.parse(receivedAt);
  const availableAt = closeAt && Number.isFinite(receivedMs)
    ? new Date(Math.max(receivedMs, Date.parse(closeAt))).toISOString()
    : receivedAt;
  const fields = [
    observedField('openTime', numeric(candle.t), 'UNIX_MILLISECONDS', 'k.t', eventAt, receivedAt, availableAt, null),
    observedField('closeTime', numeric(candle.T), 'UNIX_MILLISECONDS', 'k.T', eventAt, receivedAt, availableAt, null),
    observedField('open', numeric(candle.o), 'VENUE_REPORTED_PRICE_UNIT', 'k.o', eventAt, receivedAt, availableAt, null),
    observedField('high', numeric(candle.h), 'VENUE_REPORTED_PRICE_UNIT', 'k.h', eventAt, receivedAt, availableAt, null),
    observedField('low', numeric(candle.l), 'VENUE_REPORTED_PRICE_UNIT', 'k.l', eventAt, receivedAt, availableAt, null),
    observedField('close', numeric(candle.c), 'VENUE_REPORTED_PRICE_UNIT', 'k.c', eventAt, receivedAt, availableAt, null),
    observedField('volume', numeric(candle.v), 'VENUE_REPORTED_SIZE_UNIT', 'k.v', eventAt, receivedAt, availableAt, null),
  ];
  return makeRecord({
    kind: 'KLINE_CLOSED', endpoint: 'WS_KLINE', symbol: candle.s ?? event.s, rawPayload,
    eventAt, receivedAt, availableAt, fields, id: `kline:${candle.i}:${candle.t}`,
    quality: closeAt && eventAt ? 'VALID' : 'DEGRADED',
    flags: closeAt && eventAt ? [] : ['KLINE_TIME_MISSING'],
  });
}

function parseTicker(event, rawPayload, receivedAt) {
  const eventAt = iso(event.E);
  return makeRecord({
    kind: 'OPTION_TICKER', endpoint: 'WS_OPTION_TICKER', symbol: event.s, rawPayload, eventAt, receivedAt,
    id: eventAt ? `ticker:${eventAt}` : undefined,
    fields: [
      observedField('lastPrice', numeric(event.c), 'VENUE_REPORTED_PRICE_UNIT', 'c', eventAt, receivedAt),
      observedField('lastQuantity', numeric(event.Q), 'VENUE_REPORTED_SIZE_UNIT', 'Q', eventAt, receivedAt),
      observedField('baseVolume24h', numeric(event.v), 'VENUE_REPORTED_SIZE_UNIT', 'v', eventAt, receivedAt),
      observedField('quoteVolume24h', numeric(event.q), 'VENUE_REPORTED_QUOTE_AMOUNT', 'q', eventAt, receivedAt),
      observedField('statisticsOpenTime', numeric(event.O), 'UNIX_MILLISECONDS', 'O', eventAt, receivedAt),
      observedField('statisticsCloseTime', numeric(event.C), 'UNIX_MILLISECONDS', 'C', eventAt, receivedAt),
    ],
    quality: eventAt ? 'VALID' : 'DEGRADED',
    flags: eventAt ? [] : ['EVENT_TIME_MISSING'],
  });
}

function parseIndexOrMark(event, rawPayload, receivedAt, isMark) {
  const eventAt = iso(event.E);
  const symbol = event.s ?? event.underlying ?? event.underlyingAsset;
  const fields = isMark
    ? [
      observedField('markPrice', numeric(event.mp ?? event.markPrice), 'VENUE_REPORTED_PRICE_UNIT', 'mp', eventAt, receivedAt),
      observedField('venueVolatility', numeric(event.vo ?? event.markIV), 'VENUE_REPORTED_RAW_UNIT', 'vo', eventAt, receivedAt),
      observedField('delta', numeric(event.d), 'VENUE_REPORTED_RAW_UNIT', 'd', eventAt, receivedAt),
      observedField('gamma', numeric(event.g), 'VENUE_REPORTED_RAW_UNIT', 'g', eventAt, receivedAt),
      observedField('theta', numeric(event.t), 'VENUE_REPORTED_RAW_UNIT', 't', eventAt, receivedAt),
      observedField('vega', numeric(event.v), 'VENUE_REPORTED_RAW_UNIT', 'v', eventAt, receivedAt),
    ]
    : [observedField('indexPrice', numeric(event.p), 'VENUE_REPORTED_INDEX_UNIT', 'p', eventAt, receivedAt, receivedAt, 5_000)];
  return makeRecord({
    kind: isMark ? 'MARK_PRICE' : 'INDEX_PRICE',
    endpoint: isMark ? 'WS_MARK_PRICE' : 'WS_INDEX_PRICE',
    symbol,
    rawPayload,
    eventAt,
    receivedAt,
    fields,
    id: eventAt ? `${isMark ? 'mark' : 'index'}:${eventAt}` : undefined,
    quality: eventAt ? 'VALID' : 'DEGRADED',
    flags: eventAt ? [] : ['EVENT_TIME_MISSING'],
  });
}

function parseDepthSnapshot(item, receivedAt, state) {
  const symbol = item.symbol ?? item.data?.symbol;
  const lastUpdateId = numeric(item.lastUpdateId ?? item.data?.lastUpdateId);
  const payload = item.payload ?? item.data?.payload ?? item;
  const snapshotTime = iso(payload.T ?? item.T ?? item.data?.T);
  if (!validSymbol(symbol) || !validPositiveInteger(lastUpdateId)) {
    throw new OptionsCollectorError('INVALID_DEPTH_SNAPSHOT', 'Depth snapshot needs a symbol and positive lastUpdateId.');
  }
  state.depth.set(symbol, { lastUpdateId, synced: false });
  return makeRecord({
    kind: 'DEPTH_SNAPSHOT', endpoint: 'REST_DEPTH', symbol, rawPayload: payload,
    eventAt: snapshotTime, receivedAt,
    fields: [
      observedField('lastUpdateId', lastUpdateId, 'UPDATE_ID', 'lastUpdateId', snapshotTime, receivedAt, receivedAt, null),
      observedField('bids', item.bids ?? item.data?.bids ?? payload.bids, 'PRICE_SIZE_LEVELS', 'bids', snapshotTime, receivedAt, receivedAt, 1_000),
      observedField('asks', item.asks ?? item.data?.asks ?? payload.asks, 'PRICE_SIZE_LEVELS', 'asks', snapshotTime, receivedAt, receivedAt, 1_000),
    ],
    id: 'depth-snapshot:' + lastUpdateId,
    quality: snapshotTime ? 'VALID' : 'DEGRADED',
    flags: snapshotTime ? [] : ['REST_SNAPSHOT_HAS_NO_EXCHANGE_EVENT_TIME'],
  });
}

export function parseBinancePublicStreamEvent(rawPayload, receivedAt, state = {}) {
  const event = unwrap(rawPayload);
  if (Array.isArray(event)) {
    return event.flatMap((item) => parseBinancePublicStreamEvent(item, receivedAt, state));
  }
  const eventType = event.e;
  if (eventType === 'bookTicker') return [attachContractSpec(parseBookTicker(event, rawPayload, receivedAt), state)];
  if (eventType === 'trade') return [attachContractSpec(parseTrade(event, rawPayload, receivedAt), state)];
  if (eventType === 'kline') {
    const record = parseKline(event, rawPayload, receivedAt);
    return record ? [attachContractSpec(record, state)] : [];
  }
  if (eventType === '24hrTicker') return [attachContractSpec(parseTicker(event, rawPayload, receivedAt), state)];
  if (eventType === 'indexPrice') return [parseIndexOrMark(event, rawPayload, receivedAt, false)];
  if (eventType === 'optionMarkPrice' || eventType === 'markPrice') return [attachContractSpec(parseIndexOrMark(event, rawPayload, receivedAt, true), state)];
  if (eventType === 'depthUpdate') {
    const symbol = event.s;
    const prior = state.depth?.get(symbol);
    const eventAt = iso(event.E);
    const current = numeric(event.u);
    const previous = numeric(event.pu);
    const firstDiffBridgesSnapshot = prior && !prior.synced && Number.isFinite(prior.lastUpdateId)
      && numeric(event.U) <= prior.lastUpdateId + 1
      && current >= prior.lastUpdateId + 1;
    const sequenceValid = prior && (prior.synced ? previous === prior.lastUpdateId : firstDiffBridgesSnapshot);
    const quality = !sequenceValid ? 'INVALID' : (!eventAt ? 'DEGRADED' : 'VALID');
    const flags = [
      ...(!sequenceValid ? [prior?.lastUpdateId === null || !prior ? 'DEPTH_BASELINE_MISSING' : 'DEPTH_SEQUENCE_GAP'] : []),
      ...(!eventAt ? ['EVENT_TIME_MISSING'] : []),
    ];
    const diff = makeRecord({
      kind: 'DEPTH_DIFF', endpoint: 'WS_DEPTH', symbol, rawPayload, eventAt, receivedAt,
      fields: [
        observedField('firstUpdateId', numeric(event.U), 'UPDATE_ID', 'U', eventAt, receivedAt, receivedAt, null),
        observedField('finalUpdateId', current, 'UPDATE_ID', 'u', eventAt, receivedAt, receivedAt, null),
        observedField('previousFinalUpdateId', previous, 'UPDATE_ID', 'pu', eventAt, receivedAt, receivedAt, null),
        observedField('bids', event.b, 'PRICE_SIZE_LEVELS', 'b', eventAt, receivedAt, receivedAt, 1_000),
        observedField('asks', event.a, 'PRICE_SIZE_LEVELS', 'a', eventAt, receivedAt, receivedAt, 1_000),
        observedField('transactionTime', numeric(event.T), 'UNIX_MILLISECONDS', 'T', iso(event.T), receivedAt, receivedAt, null),
      ],
      id: validPositiveInteger(current) ? `depth:${current}` : undefined,
      quality,
      flags,
    });
    if (state.depth) state.depth.set(symbol, sequenceValid
      ? { lastUpdateId: current, synced: true }
      : { lastUpdateId: null, synced: false });
    if (sequenceValid) return [attachContractSpec(diff, state)];
    const gap = makeRecord({
      kind: 'GAP', endpoint: 'WS_DEPTH', symbol, rawPayload, eventAt, receivedAt,
      fields: [], quality: 'DEGRADED', flags,
      id: `depth-gap:${eventAt ?? receivedAt}:${event.U ?? 'unknown'}:${event.u ?? 'unknown'}`,
    });
    return [attachContractSpec(diff, state), gap];
  }
  return [];
}

function gapRecord(rawPayload, receivedAt, reason) {
  return createOptionsArchiveRecord({
    kind: 'GAP',
    endpoint: 'WS_CONNECTION',
    symbol: 'UNKNOWN',
    idempotencyKey: `GAP|connection|${reason}|${receivedAt}`,
    rawPayload,
    clocks: { exchangeEventAt: null, receivedAt, availableAt: receivedAt },
    contractSpec: null,
    fields: [],
    quality: { status: 'DEGRADED', flags: [reason] },
    historicalBackfill: false,
  });
}

export async function collectForwardOptionsEvents({ archive, transport, streams, enabled = false, now = () => new Date().toISOString() }) {
  if (enabled !== true) throw new OptionsCollectorError('COLLECTOR_DISABLED', 'Forward collection is opt-in and remains disabled by default.');
  if (!archive || typeof archive.acquireWriterLease !== 'function' || !transport || typeof transport.subscribe !== 'function') {
    throw new OptionsCollectorError('TRANSPORT_REQUIRED', 'An archive and injected async-iterable transport are required.');
  }
  const isSupportedPublicStream = (stream) => typeof stream === 'string' && (
    /^[a-z0-9-]+@(bookTicker|optionTrade|optionTicker\d{6}?|optionTicker|kline_(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|1M)|depth@(100ms|500ms)|depth(5|10|20)@(100ms|500ms))$/i.test(stream)
    || /^[a-z0-9]+@(optionMarkPrice|markPrice)$/i.test(stream)
    || stream === '!index@arr'
  );
  if (!Array.isArray(streams) || streams.length === 0 || streams.some((stream) => !isSupportedPublicStream(stream))) {
    throw new OptionsCollectorError('INVALID_STREAMS', 'Only supported public Binance Options stream names are accepted.');
  }
  const lease = await archive.acquireWriterLease();
  const state = { depth: new Map(), contractSpecs: new Map() };
  let processed = 0;
  let archived = 0;
  let gaps = 0;
  try {
    const iterable = await transport.subscribe(streams);
    for await (const item of iterable) {
      const receivedAt = now();
      if (Date.now() >= lease.expiresAt - 10_000) await archive.renewWriterLease(lease);
      let records = [];
      if (item?.type === 'exchangeInfo') {
        const raw = item.payload ?? item.data ?? item;
        records = parseExchangeInfo(raw, receivedAt, state);
      } else if (item?.type === 'depthSnapshot') {
        records = [attachContractSpec(parseDepthSnapshot(item, receivedAt, state), state)];
      } else if (item?.type === 'disconnect' || item?.type === 'reconnect') {
        state.depth.clear();
        records = [gapRecord(item, receivedAt, item.type === 'disconnect' ? 'STREAM_DISCONNECTED' : 'STREAM_RECONNECTED')];
        gaps += 1;
      } else {
        const raw = item?.type === 'message' ? item.data : item;
        records = parseBinancePublicStreamEvent(raw, receivedAt, state)
          .map((record) => attachContractSpec(record, state));
        if (records.some((record) => record.kind === 'GAP')) gaps += 1;
      }
      processed += 1;
      if (records.length) {
        const last = records[records.length - 1];
        const result = await archive.appendBatch(records, {
          lease,
          cursor: { lastIdempotencyKey: last.idempotencyKey, lastReceivedAt: receivedAt },
        });
        archived += result.appended;
      }
    }
    return { processed, archived, gaps };
  } catch (error) {
    if (error?.status === 451 || error?.status === 403) {
      throw new OptionsCollectorError('ELIGIBILITY_BLOCKED', 'Stream transport reported a legal/eligibility restriction; collector stopped.');
    }
    throw error;
  } finally {
    await archive.releaseWriterLease(lease);
  }
}

export function createFakeOptionsTransport(events) {
  return {
    async subscribe(streams) {
      if (!Array.isArray(streams) || streams.length === 0) throw new OptionsCollectorError('INVALID_STREAMS', 'Fake transport requires explicit stream names.');
      return (async function* () { for (const event of events) yield event; })();
    },
  };
}
