export type OptionSide = 'CALL' | 'PUT';
export type AssetClass = 'CRYPTO' | 'EQUITY' | 'INDEX' | 'RATES' | 'FX' | 'ENERGY' | 'METALS' | 'AGRICULTURE' | 'OTHER' | 'UNKNOWN';
export type UnderlyingKind = 'SPOT' | 'FUTURE' | 'PERPETUAL' | 'INDEX' | 'FX_SPOT' | 'UNKNOWN';
export type ExerciseStyle = 'EUROPEAN' | 'AMERICAN' | 'BERMUDAN' | 'UNKNOWN';
export type SettlementStyle = 'CASH' | 'PHYSICAL' | 'UNKNOWN';
export type Underlying = string;
export type QuotePriceSource = 'MARK' | 'MID' | 'LAST' | 'BID' | 'ASK' | 'MODEL';
export type PricingStatus = 'SUPPORTED' | 'ASSUMED' | 'OBSERVED_ONLY';
export type PricingModelName = 'BLACK_SCHOLES_CARRY' | 'BLACK_76';

export interface OptionFilter {
  filterType: string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
}

export interface UnverifiedSourceGreeks {
  /** Raw exchange values kept for diagnostics only; units are not normalised or used in calculations. */
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

export interface OptionQuote {
  id: string;
  symbol: string;
  underlying: Underlying;
  assetClass?: AssetClass;
  venue?: string;
  underlyingKind?: UnderlyingKind;
  forward?: number;
  carryYield?: number;
  pricingStatus?: PricingStatus;
  pricingModel?: PricingModelName;
  pricingReason?: string;
  quoteAsset?: string;
  settlementAsset?: string;
  contractMultiplier?: number;
  exerciseStyle?: ExerciseStyle;
  settlementStyle?: SettlementStyle;
  expiryTimezone?: string;
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
  /** Exchange-provided IV at the best bid, in annual decimal units. */
  bidIv?: number;
  /** Exchange-provided IV at the best ask, in annual decimal units. */
  askIv?: number;
  /** Unmodified source Greeks retained for audit; never used by the pricing model. */
  unverifiedSourceGreeks?: UnverifiedSourceGreeks;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  /** Premium sensitivity per one percentage-point increase in the annual risk-free rate. */
  rho: number;
  openInterest: number | null;
  openInterestUsd?: number | null;
  volume: number | null;
  volumeQuote?: number | null;
  spot: number;
  unit: number;
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
  openInterestUsdEstimated?: boolean;
  volume24hUsd: number | null;
  volume24hUsdEstimated?: boolean;
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
  quantityPrecision?: number;
  entryPremium: number;
  pricePrecision?: number;
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
  /** Premium sensitivity per +1 percentage point in the annual continuously compounded rate. */
  rhoPerRatePoint: number;
}
