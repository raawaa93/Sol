export type OptionSide = 'CALL' | 'PUT';
export type Underlying = string;
export type QuotePriceSource = 'MARK' | 'MID' | 'LAST' | 'BID' | 'ASK' | 'MODEL';

export interface OptionFilter {
  filterType: string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
}

export interface OptionQuote {
  id: string;
  symbol: string;
  underlying: Underlying;
  expiry: string;
  daysToExpiry: number;
  strike: number;
  type: OptionSide;
  /** 0 means the bid/ask side was not present in the source. */
  bid: number;
  /** 0 means the bid/ask side was not present in the source. */
  ask: number;
  markPrice: number;
  priceSource?: QuotePriceSource;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  openInterest: number | null;
  openInterestUsd?: number | null;
  volume: number | null;
  volumeQuote?: number | null;
  spot: number;
  unit: number;
  quoteAsset?: string;
  contractStatus?: string;
  minQty?: number;
  maxQty?: number;
  makerFeeRate?: number;
  takerFeeRate?: number;
  priceScale?: number;
  quantityScale?: number;
  riskFreeRate?: number;
  filters?: OptionFilter[];
  sourceTimestamp?: string;
  /** Values calculated or defaulted during import or normalisation. */
  estimatedFields?: string[];
}

export interface AssetSnapshot {
  underlying: Underlying;
  spot: number;
  dayChangePct: number;
  iv30: number | null;
  rv30: number | null;
  openInterestUsd: number | null;
  volume24hUsd: number | null;
  fundingRate: number;
}

export interface PaperTrade {
  id: string;
  createdAt: string;
  underlying: Underlying;
  symbol: string;
  type: OptionSide;
  expiry: string;
  strike: number;
  quantity: number;
  entryPremium: number;
  fees: number;
  spotAtEntry: number;
  status: 'PAPER';
}

export interface OptionGreeks {
  price: number;
  delta: number;
  gamma: number;
  thetaPerDay: number;
  vegaPerVolPoint: number;
}
