export type BinanceOptionTradeExecutionType = 'MARKET' | 'BLOCK';
export type BinanceOptionTradeSide = 'BUY' | 'SELL';

export interface BinanceOptionTradeEvent {
  venue: 'BINANCE_OPTIONS';
  schemaVersion: 1;
  eventTime: number;
  transactionTime: number;
  receivedAt: number;
  symbol: string;
  tradeId: string;
  price: number;
  quantity: number;
  executionType: BinanceOptionTradeExecutionType;
  tradeSide: BinanceOptionTradeSide;
  buyerIsMaker: boolean;
  aggressorSide: BinanceOptionTradeSide;
  /** Signed venue quantity only; not a contract-normalised exposure or premium notional. */
  signedQuantity: number;
  raw: Readonly<Record<string, unknown>>;
}

export interface BinanceOptionTradeParseOptions {
  /** Local receive timestamp in Unix milliseconds; inject for deterministic replay/tests. */
  receivedAt?: number;
}

export interface BinanceOptionTradeDeduplicationResult {
  events: BinanceOptionTradeEvent[];
  duplicateCount: number;
}

/** Parse Binance Options `optionTrade` events (raw or combined-stream envelopes). */
export function parseBinanceOptionTradeMessage(
  payload: unknown,
  options: BinanceOptionTradeParseOptions = {},
): BinanceOptionTradeEvent[] {
  let decoded = payload;
  if (typeof decoded === 'string') {
    try {
      decoded = JSON.parse(decoded) as unknown;
    } catch {
      return [];
    }
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return [];

  const envelope = decoded as Record<string, unknown>;
  const raw = envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)
    ? envelope.data as Record<string, unknown>
    : envelope;
  if (raw.e !== 'trade') return [];

  const symbol = typeof raw.s === 'string' ? raw.s.trim() : '';
  const tradeId = typeof raw.t === 'string' || typeof raw.t === 'number' ? String(raw.t) : '';
  const executionType = raw.X;
  const tradeSide = raw.S;
  if (!symbol || !tradeId || !/^\d+$/.test(tradeId)) return [];
  if (executionType !== 'MARKET' && executionType !== 'BLOCK') return [];
  if (tradeSide !== 'BUY' && tradeSide !== 'SELL') return [];
  if (typeof raw.m !== 'boolean') return [];

  const eventTime = toPositiveTimestamp(raw.E);
  const transactionTime = toPositiveTimestamp(raw.T);
  const price = toPositiveNumber(raw.p);
  const quantity = toPositiveNumber(raw.q);
  const receivedAt = options.receivedAt ?? Date.now();
  if (!eventTime || !transactionTime || !price || !quantity
    || !Number.isSafeInteger(receivedAt) || receivedAt <= 0) return [];

  // Binance m=true: buyer is maker, therefore seller is taker.
  // Binance m=false: buyer is taker.
  const aggressorSide: BinanceOptionTradeSide = raw.m ? 'SELL' : 'BUY';
  return [{
    venue: 'BINANCE_OPTIONS',
    schemaVersion: 1,
    eventTime,
    transactionTime,
    receivedAt,
    symbol,
    tradeId,
    price,
    quantity,
    executionType,
    tradeSide,
    buyerIsMaker: raw.m,
    aggressorSide,
    signedQuantity: aggressorSide === 'BUY' ? quantity : -quantity,
    raw: { ...raw },
  }];
}

/** Idempotent within the supplied batch; key is venue + symbol + trade ID. */
export function deduplicateBinanceOptionTrades(
  events: BinanceOptionTradeEvent[],
): BinanceOptionTradeDeduplicationResult {
  const seen = new Set<string>();
  const accepted: BinanceOptionTradeEvent[] = [];
  let duplicateCount = 0;
  for (const event of events) {
    const key = `${event.venue}|${event.symbol}|${event.tradeId}`;
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    accepted.push(event);
  }
  return { events: accepted, duplicateCount };
}

export interface BinanceOptionTradeFlowAggregate {
  symbol: string;
  executionType: BinanceOptionTradeExecutionType;
  tradeCount: number;
  buyerAggressorQuantity: number;
  sellerAggressorQuantity: number;
  signedAggressorQuantity: number;
  quantityUnit: 'VENUE_REPORTED_UNNORMALIZED';
  classification: 'OBSERVED_TAKER_SIDE_PROXY';
}

/**
 * Aggregate raw venue quantities separately by symbol and execution type.
 * This intentionally does not infer premium notional, Greeks, open/close,
 * institutional identity, or dealer inventory.
 */
export function aggregateBinanceOptionTradeFlow(
  events: BinanceOptionTradeEvent[],
): BinanceOptionTradeFlowAggregate[] {
  const groups = new Map<string, BinanceOptionTradeFlowAggregate>();
  for (const event of events) {
    const key = `${event.symbol}|${event.executionType}`;
    let aggregate = groups.get(key);
    if (!aggregate) {
      aggregate = {
        symbol: event.symbol,
        executionType: event.executionType,
        tradeCount: 0,
        buyerAggressorQuantity: 0,
        sellerAggressorQuantity: 0,
        signedAggressorQuantity: 0,
        quantityUnit: 'VENUE_REPORTED_UNNORMALIZED',
        classification: 'OBSERVED_TAKER_SIDE_PROXY',
      };
      groups.set(key, aggregate);
    }
    aggregate.tradeCount += 1;
    if (event.aggressorSide === 'BUY') aggregate.buyerAggressorQuantity += event.quantity;
    else aggregate.sellerAggressorQuantity += event.quantity;
    aggregate.signedAggressorQuantity += event.signedQuantity;
  }
  return [...groups.values()];
}

function toPositiveNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value)
      : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function toPositiveTimestamp(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}
